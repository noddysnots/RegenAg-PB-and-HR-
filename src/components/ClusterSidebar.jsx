import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * @typedef {import('./ClusterLayer.jsx').Cluster} Cluster
 */

/**
 * @param {object} props
 * @param {Cluster[]} props.clusters
 * @param {string | null} props.selectedClusterId
 * @param {(clusterId: string) => void} props.onClusterSelect
 * @param {(clusterId: string) => void} props.onDownload
 * @param {(clusterId: string) => void} props.onDelete
 * @param {boolean} props.collapsed
 * @param {() => void} props.onToggleCollapse
 */
export function ClusterSidebar({
  clusters,
  selectedClusterId,
  onClusterSelect,
  onDownload,
  onDelete,
  collapsed,
  onToggleCollapse,
}) {
  const [q, setQ] = useState('')
  const rowRefs = useRef(/** @type {Record<string, HTMLButtonElement | null>} */ ({}))

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return clusters
    return clusters.filter((c) => c.cluster_name.toLowerCase().includes(s))
  }, [clusters, q])

  const byState = useMemo(() => {
    const order = ['HARYANA', 'PUNJAB']
    const map = new Map()
    for (const c of filtered) {
      const sk = String(c.state ?? '')
        .trim()
        .toUpperCase()
      const key = sk.includes('HARYANA')
        ? 'HARYANA'
        : sk.includes('PUNJAB')
          ? 'PUNJAB'
          : sk || 'OTHER'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(c)
    }
    const keys = [...new Set([...order, ...map.keys()])].filter((k) =>
      map.has(k),
    )
    return keys.map((k) => ({ state: k, items: map.get(k) ?? [] }))
  }, [filtered])

  useEffect(() => {
    if (!selectedClusterId) return
    const el = rowRefs.current[selectedClusterId]
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedClusterId])

  if (collapsed) {
    return (
      <div className="flex w-10 shrink-0 flex-col border-l border-[#E5E0D8] bg-white">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="border-b border-[#E5E0D8] px-2 py-3 text-xs font-bold text-[#1C3A2A] hover:bg-[#EDF4EE]"
          title="Expand clusters"
        >
          +
        </button>
      </div>
    )
  }

  return (
    <aside className="flex h-full min-h-0 w-full min-w-0 flex-col border-l border-[#E5E0D8] bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-[#E5E0D8] px-3 py-2">
        <div>
          <p className="font-['Sora',sans-serif] text-sm font-semibold text-[#1C3A2A]">
            Clusters
          </p>
          <p className="text-[0.65rem] font-medium text-[#1C3A2A]/60">
            {clusters.length.toLocaleString('en-IN')} total
          </p>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            title="Collapse panel"
            onClick={onToggleCollapse}
            className="rounded border border-[#1C3A2A]/25 px-2 py-0.5 text-xs font-bold text-[#1C3A2A] hover:bg-[#EDF4EE]"
          >
            ↓
          </button>
        </div>
      </div>

      <div className="border-b border-[#E5E0D8] px-2 py-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name…"
          className="w-full rounded-lg border border-[#1C3A2A]/20 bg-[#F7F6F2] px-2 py-1.5 text-xs text-[#1C3A2A] outline-none placeholder:text-[#1C3A2A]/45 focus:border-[#1C3A2A]/40"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {byState.map(({ state, items }) => (
          <div key={state}>
            <div className="sticky top-0 z-[1] bg-[#F7F6F2] px-3 py-1.5 text-[0.65rem] font-bold uppercase tracking-wide text-[#1C3A2A]/70">
              {state === 'OTHER'
                ? 'Other'
                : state === 'PUNJAB'
                  ? 'Punjab'
                  : state === 'HARYANA'
                    ? 'Haryana'
                    : state}
            </div>
            <ul className="divide-y divide-[#E5E0D8]">
              {items.map((c) => {
                const sel = selectedClusterId === c.cluster_id
                return (
                  <li key={c.cluster_id}>
                    <button
                      type="button"
                      ref={(el) => {
                        rowRefs.current[c.cluster_id] = el
                      }}
                      onClick={() => onClusterSelect(c.cluster_id)}
                      className={`w-full px-3 py-2.5 text-left transition hover:bg-[#EDF4EE] ${
                        sel
                          ? 'border-l-[3px] border-l-[#1C3A2A] bg-[#E8EEEA] pl-[9px]'
                          : 'border-l-[3px] border-l-transparent'
                      }`}
                    >
                      <p className="text-sm font-semibold leading-snug text-[#1C3A2A]">
                        {c.cluster_name}
                      </p>
                      <p className="mt-1 text-[0.65rem] text-[#1C3A2A]/75">
                        <span className="mr-2">
                          📍 {c.villages.length} villages
                        </span>
                        <span>🏠 {c.farms.toLocaleString('en-IN')} farms</span>
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          className="rounded border border-[#1C3A2A]/25 bg-white px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-[#1C3A2A] hover:bg-[#F7F6F2]"
                          onClick={(e) => {
                            e.stopPropagation()
                            onDownload(c.cluster_id)
                          }}
                        >
                          Download CSV
                        </button>
                        <button
                          type="button"
                          className="rounded border border-[#D97706]/35 bg-[#D97706]/10 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-[#92400e] hover:bg-[#D97706]/20"
                          onClick={(e) => {
                            e.stopPropagation()
                            onDelete(c.cluster_id)
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </aside>
  )
}
