import {
  uniqueStateOptions,
  districtOptions,
  blockOptions,
  villageOptions,
} from '../utils/filters'

const selectClass =
  'w-full rounded-lg border border-[#1C3A2A]/20 bg-white px-3 py-2 text-sm font-medium text-[#1C3A2A] shadow-sm outline-none transition focus:border-[#1C3A2A]/50 focus:ring-2 focus:ring-[#1C3A2A]/20 appearance-none bg-[length:1rem_1rem] bg-[right_0.6rem_center] bg-no-repeat pr-9'

const selectHorizontal =
  'w-full min-w-0 rounded-lg border border-[#1C3A2A]/20 bg-white px-2 py-1.5 text-xs font-medium text-[#1C3A2A] shadow-sm outline-none transition focus:border-[#1C3A2A]/50 focus:ring-2 focus:ring-[#1C3A2A]/20 appearance-none bg-[length:0.85rem] bg-[right_0.45rem_center] bg-no-repeat pr-7'

const arrowSvg =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%231C3A2A'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E"

const selectStyle = {
  backgroundImage: `url("${arrowSvg}")`,
}

/**
 * @param {object} props
 * @param {import('../utils/parseExcel.js').FarmRecord[]} props.records
 * @param {{ stateKey: string, districtKey: string, blockKey: string, villageKey: string }} props.selection
 * @param {(s: typeof props.selection) => void} props.onSelectionChange
 * @param {'stacked' | 'horizontal' | 'overlay'} [props.layout]
 * @param {boolean} [props.toolbar] with `layout="horizontal"`: slim full-width bar (no Geography card)
 * @param {boolean | null} [props.blockBoundaryAvailable] when explicitly
 *   `false` and a block is selected, the overlay layout renders a
 *   "Block boundary unavailable" badge next to the Clear button.
 */
export function FilterBar({
  records,
  selection,
  onSelectionChange,
  layout = 'stacked',
  toolbar = false,
  blockBoundaryAvailable = null,
}) {
  const states = uniqueStateOptions(records)
  const districts = districtOptions(records, {
    stateKey: selection.stateKey,
    districtKey: '',
    blockKey: '',
    villageKey: '',
  })
  const blocks = blockOptions(records, {
    stateKey: selection.stateKey,
    districtKey: selection.districtKey,
    blockKey: '',
    villageKey: '',
  })
  const villages = villageOptions(records, {
    stateKey: selection.stateKey,
    districtKey: selection.districtKey,
    blockKey: selection.blockKey,
    villageKey: '',
  })

  function patch(partial) {
    onSelectionChange({ ...selection, ...partial })
  }

  const horizontalFields = (
    <>
      <label className="flex min-w-0 flex-1 flex-col text-[0.65rem] font-medium text-[#1C3A2A]/70">
        State
        <select
          className={`${selectHorizontal} mt-0.5`}
          style={selectStyle}
          value={selection.stateKey}
          onChange={(e) => {
            const stateKey = e.target.value
            onSelectionChange({
              stateKey,
              districtKey: '',
              blockKey: '',
              villageKey: '',
            })
          }}
        >
          <option value="">All States</option>
          {states.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex min-w-0 flex-1 flex-col text-[0.65rem] font-medium text-[#1C3A2A]/70">
        District
        <select
          className={`${selectHorizontal} mt-0.5`}
          style={selectStyle}
          value={selection.districtKey}
          onChange={(e) => {
            patch({
              districtKey: e.target.value,
              blockKey: '',
              villageKey: '',
            })
          }}
        >
          <option value="">All Districts</option>
          {districts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex min-w-0 flex-1 flex-col text-[0.65rem] font-medium text-[#1C3A2A]/70">
        Block
        <select
          className={`${selectHorizontal} mt-0.5`}
          style={selectStyle}
          value={selection.blockKey}
          onChange={(e) => {
            patch({
              blockKey: e.target.value,
              villageKey: '',
            })
          }}
        >
          <option value="">All Blocks</option>
          {blocks.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex min-w-0 flex-1 flex-col text-[0.65rem] font-medium text-[#1C3A2A]/70">
        Village
        <select
          className={`${selectHorizontal} mt-0.5`}
          style={selectStyle}
          value={selection.villageKey}
          onChange={(e) => patch({ villageKey: e.target.value })}
        >
          <option value="">All Villages</option>
          {villages.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </>
  )

  if (layout === 'overlay') {
    /**
     * Compact translucent filter strip designed to overlay the map.
     * Renders flat dropdowns in a single row with a Clear button and
     * an optional "Block boundary unavailable" badge.
     */
    const overlaySelect =
      'w-full min-w-0 truncate rounded-md border border-[#1C3A2A]/15 bg-white/85 px-2 py-1 text-xs font-medium text-[#1C3A2A] shadow-sm outline-none transition focus:border-[#1C3A2A] focus:ring-2 focus:ring-[#1C3A2A]/15 appearance-none bg-[length:0.85rem] bg-[right_0.45rem_center] bg-no-repeat pr-7'

    /**
     * @param {string} label
     * @param {string} value
     * @param {(next: string) => void} onChange
     * @param {Array<{ value: string, label: string }>} options
     * @param {string} widthClass
     */
    const dropdown = (label, value, onChange, options, widthClass) => (
      <label
        className={`flex min-w-0 ${widthClass} flex-col text-[0.55rem] font-semibold uppercase tracking-wider text-[#1C3A2A]/55`}
      >
        {label}
        <select
          className={`${overlaySelect} mt-0.5`}
          style={selectStyle}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">All {label.toLowerCase()}s</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    )

    return (
      <div className="flex w-full items-center gap-2">
        {dropdown(
          'State',
          selection.stateKey,
          (stateKey) =>
            onSelectionChange({
              stateKey,
              districtKey: '',
              blockKey: '',
              villageKey: '',
            }),
          states,
          'flex-1 max-w-[140px]',
        )}
        {dropdown(
          'District',
          selection.districtKey,
          (districtKey) => patch({ districtKey, blockKey: '', villageKey: '' }),
          districts,
          'flex-1 max-w-[170px]',
        )}
        {dropdown(
          'Block',
          selection.blockKey,
          (blockKey) => patch({ blockKey, villageKey: '' }),
          blocks,
          'flex-1 max-w-[170px]',
        )}
        {dropdown(
          'Village',
          selection.villageKey,
          (villageKey) => patch({ villageKey }),
          villages,
          'flex-1 max-w-[170px]',
        )}
        <button
          type="button"
          onClick={() =>
            onSelectionChange({
              stateKey: '',
              districtKey: '',
              blockKey: '',
              villageKey: '',
            })
          }
          className="shrink-0 whitespace-nowrap rounded-md border border-[#D97706]/40 bg-[#D97706]/10 px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wide text-[#92400e] transition hover:bg-[#D97706]/20"
        >
          Clear
        </button>
        {selection.blockKey && blockBoundaryAvailable === false ? (
          <span className="shrink-0 whitespace-nowrap rounded-md border border-amber-400/40 bg-amber-50/85 px-2 py-0.5 text-[0.65rem] font-medium italic text-amber-800">
            ⚠ Block boundary unavailable — showing district outline
          </span>
        ) : null}
      </div>
    )
  }

  if (layout === 'horizontal' && toolbar) {
    return (
      <div className="w-full shrink-0 border-b border-[#1C3A2A]/12 bg-[#F7F6F2] px-3 py-2">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-end gap-2 lg:flex-nowrap lg:gap-3">
          {horizontalFields}
          <button
            type="button"
            onClick={() =>
              onSelectionChange({
                stateKey: '',
                districtKey: '',
                blockKey: '',
                villageKey: '',
              })
            }
            className="shrink-0 rounded-lg border border-[#D97706]/40 bg-[#D97706]/10 px-3 py-1.5 text-[0.65rem] font-bold uppercase tracking-wide text-[#92400e] transition hover:bg-[#D97706]/20 lg:self-end"
          >
            Clear
          </button>
        </div>
      </div>
    )
  }

  if (layout === 'horizontal') {
    return (
      <section className="rounded-xl border border-[#1C3A2A]/12 bg-white/90 p-3 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-['Sora',sans-serif] text-[0.65rem] font-semibold uppercase tracking-wide text-[#1C3A2A]/75">
            Geography (dropdowns)
          </h2>
          <button
            type="button"
            onClick={() =>
              onSelectionChange({
                stateKey: '',
                districtKey: '',
                blockKey: '',
                villageKey: '',
              })
            }
            className="shrink-0 rounded-lg border border-[#D97706]/40 bg-[#D97706]/10 px-2 py-1 text-[0.65rem] font-bold uppercase tracking-wide text-[#92400e] transition hover:bg-[#D97706]/20"
          >
            Clear
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{horizontalFields}</div>
      </section>
    )
  }

  return (

    <aside className="flex flex-col gap-4 rounded-xl border border-[#1C3A2A]/12 bg-white/80 p-4 shadow-sm backdrop-blur-sm">
      <h2 className="font-['Sora',sans-serif] text-sm font-semibold uppercase tracking-wide text-[#1C3A2A]/80">
        Geography
      </h2>

      <label className="block text-xs font-medium text-[#1C3A2A]/70">
        State
        <select
          className={`${selectClass} mt-1`}
          style={selectStyle}
          value={selection.stateKey}
          onChange={(e) => {
            const stateKey = e.target.value
            onSelectionChange({
              stateKey,
              districtKey: '',
              blockKey: '',
              villageKey: '',
            })
          }}
        >
          <option value="">All States</option>
          {states.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs font-medium text-[#1C3A2A]/70">
        District
        <select
          className={`${selectClass} mt-1`}
          style={selectStyle}
          value={selection.districtKey}
          onChange={(e) => {
            patch({
              districtKey: e.target.value,
              blockKey: '',
              villageKey: '',
            })
          }}
        >
          <option value="">All Districts</option>
          {districts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs font-medium text-[#1C3A2A]/70">
        Block
        <select
          className={`${selectClass} mt-1`}
          style={selectStyle}
          value={selection.blockKey}
          onChange={(e) => {
            patch({
              blockKey: e.target.value,
              villageKey: '',
            })
          }}
        >
          <option value="">All Blocks</option>
          {blocks.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs font-medium text-[#1C3A2A]/70">
        Village
        <select
          className={`${selectClass} mt-1`}
          style={selectStyle}
          value={selection.villageKey}
          onChange={(e) => patch({ villageKey: e.target.value })}
        >
          <option value="">All Villages</option>
          {villages.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={() =>
          onSelectionChange({
            stateKey: '',
            districtKey: '',
            blockKey: '',
            villageKey: '',
          })
        }
        className="rounded-lg border border-[#D97706]/40 bg-[#D97706]/10 px-3 py-2 text-sm font-semibold text-[#92400e] transition hover:bg-[#D97706]/20"
      >
        Clear Filters
      </button>
    </aside>
  )
}
