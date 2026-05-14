import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FilterBar } from './components/FilterBar'
import { MapPanel } from './components/MapPanel'
import { ClusterSidebar } from './components/ClusterSidebar'
import { downloadClusterRowsAsCsv } from './utils/clusterCsvDownload'
import { SummaryCards } from './components/SummaryCards'
import { SurveyorTable } from './components/SurveyorTable'
import { BlockDrillPanel } from './components/BlockDrillPanel'
import { FilteredFarmsPanel } from './components/FilteredFarmsPanel'
import { parseExcelBuffer } from './utils/parseExcel'
import {
  applyGeoFilters,
  summaryStats,
  buildSurveyorAggregates,
  farmsForSurveyor,
} from './utils/filters'
import { parseClustersCsv } from './utils/parseClustersCsv'
import { jitterClusters } from './utils/jitterClusters'
import { resolveDistrict } from './utils/districtNameMap'
import {
  collectUniqueBlockRows,
  preGeocodeBlocks,
} from './utils/geocodeBlocks'
import { loadVillageGeocodes } from './utils/villageGeo'
import { loadFarmGeocodes } from './utils/loadFarmGeocodes'

/**
 * @param {Array<{ state?: string, cluster_id?: string }>} list
 * @param {string} stateKey '' = both
 */
function clustersForStateScope(list, stateKey) {
  if (!stateKey) return list
  const sk = String(stateKey).toUpperCase()
  return list.filter((c) => {
    const s = String(c.state ?? '').toUpperCase()
    if (sk === 'PUNJAB') return s.includes('PUNJAB')
    if (sk === 'HARYANA') return s.includes('HARYANA')
    return true
  })
}

/**
 * Keep only clusters that have at least one village in the selected
 * district. The cluster CSV already carries village-level rows with a
 * `district` string per cluster, so we run each through `resolveDistrict`
 * (which folds aliases like "SRI MUKTSAR SAHIB" → "MUKTSAR" and
 * "YAMUNANAGAR" → "YAMUNA NAGAR") and compare against `selection.districtKey`.
 *
 * @param {Array<{ cluster_id?: string, districtKey?: string,
 *   villages?: Array<{ district?: string }> }>} list
 * @param {string} districtKey canonical key from FilterBar; '' = no filter
 */
function clustersForDistrict(list, districtKey) {
  if (!districtKey) return list
  const target = String(districtKey).toUpperCase()
  return list.filter((c) => {
    if (c.districtKey && String(c.districtKey).toUpperCase() === target) {
      return true
    }
    const villages = c.villages ?? []
    for (const v of villages) {
      if (resolveDistrict(v.district) === target) return true
    }
    return false
  })
}

const emptySelection = {
  stateKey: '',
  districtKey: '',
  blockKey: '',
  villageKey: '',
}

const TOP_BAR_HEIGHT = 44 // px — translucent header
const FILTER_BAR_HEIGHT = 44 // px — translucent filter strip
const HEADER_STACK = TOP_BAR_HEIGHT + FILTER_BAR_HEIGHT // 88 px

export default function App() {
  const [records, setRecords] = useState([])
  const [parseErrors, setParseErrors] = useState([])
  const [selection, setSelection] = useState(emptySelection)
  const [panelSurveyorKey, setPanelSurveyorKey] = useState(null)

  const [mapMode, setMapMode] = useState(
    /** @type {'districts'|'clusters'} */ ('districts'),
  )
  const [territoriesVisible, setTerritoriesVisible] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(true)
  /** `null` while no block is picked, `true` when an LGD/village-union
   *  polygon is rendering, `false` when only a dashed district outline
   *  is available. Drives the badge next to the filter row. */
  const [blockBoundaryAvailable, setBlockBoundaryAvailable] = useState(
    /** @type {boolean | null} */ (null),
  )

  /** Uppercase `_villageKey` for the village the user has clicked
   *  inside the block-drill flow (Level-2 of the drill). */
  const [focusedBlockVillageKey, setFocusedBlockVillageKey] = useState(
    /** @type {string | null} */ (null),
  )
  /** Farm ID whose popup is open / bottom-panel row is highlighted. */
  const [focusedBlockFarmId, setFocusedBlockFarmId] = useState(
    /** @type {string | null} */ (null),
  )

  /** User explicitly closed the filter panel — stays dismissed until
   *  the dropdown selection changes. */
  const [filterPanelDismissed, setFilterPanelDismissed] = useState(false)
  /** Highlighted Farm ID inside the filter-mode bottom panel. */
  const [filterFocusedFarmId, setFilterFocusedFarmId] = useState(
    /** @type {string | null} */ (null),
  )

  const [clusters, setClusters] = useState([])
  const [clusterRows, setClusterRows] = useState(
    /** @type {Record<string, unknown>[]} */ ([]),
  )
  const [clusterParseErrors, setClusterParseErrors] = useState([])
  const [selectedClusterId, setSelectedClusterId] = useState(
    /** @type {string | null} */ (null),
  )
  const [hiddenClusterIds, setHiddenClusterIds] = useState(
    /** @type {Set<string>} */ (new Set()),
  )
  const [clusterSidebarCollapsed, setClusterSidebarCollapsed] = useState(false)
  const [blockGeoWarmProgress, setBlockGeoWarmProgress] = useState(100)
  const [villageGeoCache, setVillageGeoCache] = useState(
    /** @type {Record<string, [number, number]>} */ ({}),
  )
  const [farmGeoCache, setFarmGeoCache] = useState(
    /** @type {Record<string, [number, number]>} */ ({}),
  )

  const mapPanelRef = useRef(
    /** @type {{ flyToCluster?: (a: number, b: number, z?: number) => void } | null} */ (
      null
    ),
  )

  const filtered = useMemo(
    () => applyGeoFilters(records, selection),
    [records, selection],
  )

  const mapFilteredRows = useMemo(
    () =>
      applyGeoFilters(records, {
        stateKey: selection.stateKey,
        districtKey: '',
        blockKey: selection.blockKey,
        villageKey: selection.villageKey,
      }),
    [records, selection.stateKey, selection.blockKey, selection.villageKey],
  )

  const stats = useMemo(() => summaryStats(filtered), [filtered])

  const surveyorRows = useMemo(
    () => buildSurveyorAggregates(filtered),
    [filtered],
  )

  const panelFarms = useMemo(() => {
    if (!panelSurveyorKey) return []
    return farmsForSurveyor(filtered, panelSurveyorKey)
  }, [filtered, panelSurveyorKey])

  const panelLabel = useMemo(() => {
    if (!panelSurveyorKey) return ''
    const hit = surveyorRows.find((r) => r.surveyorKey === panelSurveyorKey)
    return hit?.surveyorLabel ?? ''
  }, [panelSurveyorKey, surveyorRows])

  const visibleClusters = useMemo(
    () => clusters.filter((c) => !hiddenClusterIds.has(c.cluster_id)),
    [clusters, hiddenClusterIds],
  )

  const scopeClusters = useMemo(
    () =>
      clustersForDistrict(
        clustersForStateScope(visibleClusters, selection.stateKey),
        selection.districtKey,
      ),
    [visibleClusters, selection.stateKey, selection.districtKey],
  )

  const mapClusters = useMemo(
    () => jitterClusters(scopeClusters),
    [scopeClusters],
  )

  /** "in Kaithal" / "in Haryana" suffix shown under the sidebar count,
   *  derived from `selection` + the first cluster village's display
   *  name so we get the original capitalisation (not the uppercase
   *  key). Falls back to the raw key when no record matches. */
  const clusterScopeLabel = useMemo(() => {
    if (selection.districtKey) {
      const sample = scopeClusters.find((c) =>
        (c.villages ?? []).some(
          (v) => resolveDistrict(v.district) === selection.districtKey,
        ),
      )
      const villageHit = sample?.villages?.find(
        (v) => resolveDistrict(v.district) === selection.districtKey,
      )
      return `in ${villageHit?.district ?? selection.districtKey}`
    }
    if (selection.stateKey) {
      const niceState =
        selection.stateKey === 'PUNJAB'
          ? 'Punjab'
          : selection.stateKey === 'HARYANA'
            ? 'Haryana'
            : selection.stateKey
      return `in ${niceState}`
    }
    return ''
  }, [scopeClusters, selection.districtKey, selection.stateKey])

  /** Farms in the focused village of the block-drill flow. The
   *  selection-level filter only requires `_blockKey` + `_villageKey`
   *  so we don't lose the list when the user hasn't picked a village
   *  in the dropdown. */
  const focusedBlockFarms = useMemo(() => {
    if (!selection.blockKey || !focusedBlockVillageKey || !records.length)
      return []
    return records.filter(
      (r) =>
        r._blockKey === selection.blockKey &&
        r._villageKey === focusedBlockVillageKey,
    )
  }, [records, selection.blockKey, focusedBlockVillageKey])

  const focusedVillageLabel = focusedBlockFarms[0]?.village ?? ''
  const focusedBlockLabel = focusedBlockFarms[0]?.block ?? selection.blockKey

  /** `true` when the dropdown has narrowed past state-only — i.e. the
   *  user has picked at least one of District / Block / Village. The
   *  filter panel only auto-opens once any of these is set. */
  const filterNarrowed = Boolean(
    selection.districtKey || selection.blockKey || selection.villageKey,
  )

  /** Human-readable filter path used as the panel title. Falls back to
   *  the raw selection keys when no records match. */
  const filterPath = useMemo(() => {
    const sample = filtered[0]
    const parts = []
    if (selection.stateKey)
      parts.push(sample?.state || selection.stateKey)
    if (selection.districtKey)
      parts.push(sample?.district || selection.districtKey)
    if (selection.blockKey) parts.push(sample?.block || selection.blockKey)
    if (selection.villageKey)
      parts.push(sample?.village || selection.villageKey)
    return parts.join(' › ')
  }, [filtered, selection])

  /** Wraps `setSelection` so changing the dropdown filter also tears
   *  down any cluster / surveyor context and un-dismisses the filter
   *  panel — matching the user's expectation that the bottom panel
   *  immediately reflects whatever is in scope. */
  const handleSelectionChange = useCallback((next) => {
    const becameNarrower = Boolean(
      next?.districtKey || next?.blockKey || next?.villageKey,
    )
    setSelection(next)
    setFilterPanelDismissed(false)
    setFilterFocusedFarmId(null)
    if (becameNarrower) {
      setSelectedClusterId(null)
      setPanelSurveyorKey(null)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void loadVillageGeocodes().then((data) => {
      if (cancelled) return
      setVillageGeoCache(data)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void loadFarmGeocodes().then((data) => {
      if (cancelled) return
      setFarmGeoCache(data)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch('/data/clusters.csv')
      .then((r) => {
        if (!r.ok) throw new Error(`clusters.csv HTTP ${r.status}`)
        return r.text()
      })
      .then((text) => {
        if (cancelled) return
        const { clusters: list, rows, errors } = parseClustersCsv(text)
        setClusterParseErrors(errors)
        setClusterRows(rows)
        setClusters(list)
      })
      .catch((e) => {
        if (cancelled) return
        setClusterParseErrors((prev) => [
          ...prev,
          e instanceof Error ? e.message : 'Failed to load clusters.csv',
        ])
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!clusters.length) {
      setBlockGeoWarmProgress(100)
      return
    }
    let alive = true
    setBlockGeoWarmProgress(0)
    void preGeocodeBlocks(collectUniqueBlockRows(clusters), (pct) => {
      if (alive) setBlockGeoWarmProgress(Math.min(100, pct))
    })
      .then(() => {
        if (alive) setBlockGeoWarmProgress(100)
      })
      .catch(() => {
        if (alive) setBlockGeoWarmProgress(100)
      })
    return () => {
      alive = false
    }
  }, [clusters])

  const onClusterDrillExit = useCallback(() => {
    setSelectedClusterId(null)
  }, [])

  const handleMapDistrictClick = useCallback((districtKey, stateFromMap) => {
    setPanelSurveyorKey(null)
    setSelectedClusterId(null)
    setFilterPanelDismissed(false)
    setSelection((s) => {
      if (districtKey === s.districtKey) {
        return {
          ...s,
          districtKey: '',
          blockKey: '',
          villageKey: '',
        }
      }
      const nextState = stateFromMap || s.stateKey
      return {
        stateKey: nextState,
        districtKey,
        blockKey: '',
        villageKey: '',
      }
    })
  }, [])

  const onStateScopeChange = useCallback((scope) => {
    setPanelSurveyorKey(null)
    setSelectedClusterId(null)
    if (scope === 'both') {
      setSelection(emptySelection)
      return
    }
    setSelection({
      stateKey: scope === 'punjab' ? 'PUNJAB' : 'HARYANA',
      districtKey: '',
      blockKey: '',
      villageKey: '',
    })
  }, [])

  const onMapModeChange = useCallback((mode) => {
    setMapMode(mode)
    if (mode === 'districts') setSelectedClusterId(null)
  }, [])

  const onClusterClick = useCallback((id) => {
    setSelectedClusterId(id)
  }, [])

  const onClusterSelect = useCallback((id) => {
    setSelectedClusterId(id)
  }, [])

  const onClusterDownload = useCallback(
    (clusterId) => {
      if (!clusterRows.length) return
      downloadClusterRowsAsCsv(clusterRows, clusterId)
    },
    [clusterRows],
  )

  const onClusterDelete = useCallback((clusterId) => {
    setHiddenClusterIds((prev) => new Set([...prev, clusterId]))
    setSelectedClusterId((cur) => (cur === clusterId ? null : cur))
  }, [])

  const onFileChange = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const buf = reader.result
      if (!(buf instanceof ArrayBuffer)) return
      const { records: next, errors } = parseExcelBuffer(buf)
      setRecords(next)
      setParseErrors(errors)
      setSelection(emptySelection)
      setPanelSurveyorKey(null)
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }, [])

  const activeScope =
    selection.stateKey === 'PUNJAB'
      ? 'punjab'
      : selection.stateKey === 'HARYANA'
        ? 'haryana'
        : 'both'

  // Hide the right summary/surveyor drawer in cluster mode — the
  // cluster sidebar takes the right edge instead.
  const showSummaryDrawer = mapMode !== 'clusters'

  // Push the floating toggle column inward when a right-edge panel is
  // open, so the pills never sit on top of the drawer chrome.
  let togglesRightPx = 12
  if (showSummaryDrawer && drawerOpen) togglesRightPx = 320 + 12
  else if (mapMode === 'clusters')
    togglesRightPx = (clusterSidebarCollapsed ? 40 : 260) + 12

  // Right-edge offset for the bottom-anchored filter panel so it never
  // tucks under whichever side drawer is currently open.
  let bottomPanelRightPx = 0
  if (showSummaryDrawer && drawerOpen) bottomPanelRightPx = 320
  else if (mapMode === 'clusters')
    bottomPanelRightPx = clusterSidebarCollapsed ? 40 : 260

  // The bottom panel (`FilteredFarmsPanel`) has TWO modes:
  //   • `surveyor` — a surveyor row was clicked in the right drawer
  //   • `filter`   — the dropdown filter has narrowed past state-only
  // Cluster drill-down and block-drill village panels take precedence
  // over both — they render first and suppress the bottom panel.
  const blockDrillPanelOpen =
    mapMode === 'districts' &&
    Boolean(selection.blockKey) &&
    Boolean(focusedBlockVillageKey) &&
    focusedBlockFarms.length > 0

  /** @type {'surveyor' | 'filter' | null} */
  let bottomPanelMode = null
  if (!selectedClusterId && !blockDrillPanelOpen) {
    if (panelSurveyorKey) {
      bottomPanelMode = 'surveyor'
    } else if (filterNarrowed && !filterPanelDismissed) {
      bottomPanelMode = 'filter'
    }
  }
  const bottomPanelFarms =
    bottomPanelMode === 'surveyor' ? panelFarms : filtered

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#F7F6F2] font-['IBM_Plex_Sans',sans-serif] text-[#1C3A2A]">
      {/* MAP — fills the entire viewport, sits behind every panel */}
      <div className="absolute inset-0 z-0">
        <MapPanel
          ref={mapPanelRef}
          data={records}
          filteredData={mapFilteredRows}
          selection={selection}
          records={records}
          onDistrictClick={handleMapDistrictClick}
          onStateScopeChange={onStateScopeChange}
          mapMode={mapMode}
          onMapModeChange={onMapModeChange}
          clusters={mapClusters}
          selectedClusterId={selectedClusterId}
          onClusterClick={onClusterClick}
          onClusterDrillExit={onClusterDrillExit}
          blockGeoWarmProgress={blockGeoWarmProgress}
          villageGeoCache={villageGeoCache}
          farmGeoCache={farmGeoCache}
          hideToolbar
          territoriesVisible={territoriesVisible}
          onTerritoriesVisibleChange={setTerritoriesVisible}
          onBlockBoundaryStateChange={setBlockBoundaryAvailable}
          focusedBlockVillageKey={focusedBlockVillageKey}
          onFocusedBlockVillageChange={setFocusedBlockVillageKey}
          focusedBlockFarmId={focusedBlockFarmId}
          onFocusedBlockFarmChange={setFocusedBlockFarmId}
        />
      </div>

      {/* TOP BAR — translucent header */}
      <header
        className="absolute left-0 right-0 top-0 z-[500] flex items-center justify-between gap-3 border-b border-white/10 bg-[#1C3A2A]/90 px-4 backdrop-blur-md"
        style={{ height: TOP_BAR_HEIGHT }}
      >
        <h1 className="truncate font-['Sora',sans-serif] text-sm font-semibold tracking-tight text-white sm:text-base">
          Farm Monitoring — Punjab &amp; Haryana
        </h1>
        <div className="flex shrink-0 items-center gap-2">
          <span className="whitespace-nowrap rounded-full bg-[#D97706] px-3 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-white">
            Total farms: {stats.totalFarms.toLocaleString('en-IN')}
          </span>
          <label className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-md border border-white/25 bg-white/15 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-white/25">
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={onFileChange}
            />
            Load spreadsheet
          </label>
        </div>
      </header>

      {/* FILTER STRIP — translucent, overlays map */}
      <div
        className="absolute left-0 right-0 z-[500] flex items-center border-b border-gray-200/60 bg-white/80 px-3 backdrop-blur-md"
        style={{
          top: TOP_BAR_HEIGHT,
          height: FILTER_BAR_HEIGHT,
        }}
      >
        <FilterBar
          layout="overlay"
          records={records}
          selection={selection}
          onSelectionChange={handleSelectionChange}
          blockBoundaryAvailable={blockBoundaryAvailable}
        />
      </div>

      {/* CLUSTER LOAD ERRORS — slim banner under the filter strip */}
      {clusterParseErrors.length > 0 ? (
        <div
          className="pointer-events-none absolute left-2 right-2 z-[500] rounded border border-amber-300/50 bg-amber-50/90 px-2 py-1 text-[0.65rem] text-amber-950 backdrop-blur-sm"
          role="status"
          style={{ top: HEADER_STACK + 4 }}
        >
          {clusterParseErrors.map((err) => (
            <p key={err}>{err}</p>
          ))}
        </div>
      ) : null}

      {/* FLOATING TOGGLE PILLS — state scope + map mode + territories */}
      <div
        className="absolute z-[500] flex flex-col items-end gap-1.5"
        style={{ top: HEADER_STACK + 8, right: togglesRightPx }}
      >
        <div className="flex gap-1">
          {['PUNJAB', 'HARYANA', 'BOTH'].map((s) => {
            const scope = s.toLowerCase()
            const isActive = activeScope === scope
            return (
              <button
                key={s}
                type="button"
                onClick={() => onStateScopeChange(scope)}
                className={`rounded-full border px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wide backdrop-blur-sm transition ${
                  isActive
                    ? 'border-[#1C3A2A] bg-[#1C3A2A] text-white'
                    : 'border-[#1C3A2A]/30 bg-white/85 text-[#1C3A2A] hover:bg-white'
                }`}
              >
                {s}
              </button>
            )
          })}
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onMapModeChange('districts')}
            className={`rounded-full border px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wide backdrop-blur-sm transition ${
              mapMode === 'districts'
                ? 'border-[#1C3A2A] bg-[#1C3A2A] text-white'
                : 'border-[#1C3A2A]/30 bg-white/85 text-[#1C3A2A] hover:bg-white'
            }`}
          >
            Districts
          </button>
          <button
            type="button"
            onClick={() => onMapModeChange('clusters')}
            className={`rounded-full border px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wide backdrop-blur-sm transition ${
              mapMode === 'clusters'
                ? 'border-[#1C3A2A] bg-[#1C3A2A] text-white'
                : 'border-[#1C3A2A]/30 bg-white/85 text-[#1C3A2A] hover:bg-white'
            }`}
          >
            Clusters
          </button>
          <button
            type="button"
            aria-pressed={territoriesVisible}
            onClick={() => setTerritoriesVisible((v) => !v)}
            className={`rounded-full border px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wide backdrop-blur-sm transition ${
              territoriesVisible
                ? 'border-[#1C3A2A] bg-[#1C3A2A] text-white'
                : 'border-[#1C3A2A]/30 bg-white/85 text-[#1C3A2A] hover:bg-white'
            }`}
          >
            Territories
          </button>
        </div>
      </div>

      {/* RIGHT DRAWER — summary cards + surveyor table */}
      {showSummaryDrawer ? (
        <aside
          className={`absolute bottom-0 right-0 z-[400] flex flex-col border-l border-gray-200/60 bg-white/85 backdrop-blur-md transition-[width] duration-300 ${
            drawerOpen ? 'w-[320px]' : 'w-0 overflow-hidden'
          }`}
          style={{ top: HEADER_STACK }}
        >
          <button
            type="button"
            onClick={() => setDrawerOpen((v) => !v)}
            className="absolute -left-7 top-4 z-[1] rounded-l border border-gray-300/70 bg-white/90 px-1 py-2 text-xs text-[#1C3A2A] backdrop-blur-sm transition hover:bg-white"
            aria-label={drawerOpen ? 'Collapse panel' : 'Expand panel'}
            title={drawerOpen ? 'Collapse panel' : 'Expand panel'}
          >
            {drawerOpen ? '›' : '‹'}
          </button>

          <div className="flex shrink-0 flex-col gap-3 p-3">
            {records.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#1C3A2A]/25 bg-white/70 p-3 text-xs text-[#1C3A2A]/75">
                <p className="font-['Sora',sans-serif] font-semibold text-[#1C3A2A]">
                  Upload your operations file
                </p>
                <p className="mt-1.5 leading-snug">
                  Use{' '}
                  <span className="font-mono font-semibold text-[#1C3A2A]">
                    19287_Farms_Data.xlsx
                  </span>{' '}
                  or any export with the same columns. Parsing runs in the
                  browser; nothing leaves your device.
                </p>
              </div>
            ) : null}

            {parseErrors.length > 0 ? (
              <div
                className="rounded-lg border border-amber-400/40 bg-amber-50/90 px-3 py-2 text-xs text-amber-950"
                role="status"
              >
                <p className="font-semibold">Import notes</p>
                <ul className="mt-1 list-inside list-disc">
                  {parseErrors.map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <SummaryCards
              totalFarms={stats.totalFarms}
              totalSurveyors={stats.totalSurveyors}
              dsrEligibleCount={stats.dsrEligibleCount}
              totalAreaAcres={stats.totalAreaAcres}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto px-3 pb-3">
            <SurveyorTable
              rows={surveyorRows}
              onRowClick={(key) => setPanelSurveyorKey(key)}
            />
          </div>
        </aside>
      ) : null}

      {/* CLUSTER SIDEBAR — replaces drawer in cluster mode */}
      {mapMode === 'clusters' ? (
        <aside
          className={`absolute bottom-0 right-0 z-[400] flex flex-col overflow-hidden border-l border-gray-200/60 bg-white/90 backdrop-blur-md ${
            clusterSidebarCollapsed ? 'w-10' : 'w-[260px]'
          }`}
          style={{ top: HEADER_STACK }}
        >
          <ClusterSidebar
            clusters={scopeClusters}
            scopeLabel={clusterScopeLabel}
            selectedClusterId={selectedClusterId}
            onClusterSelect={onClusterSelect}
            onDownload={onClusterDownload}
            onDelete={onClusterDelete}
            collapsed={clusterSidebarCollapsed}
            onToggleCollapse={() => setClusterSidebarCollapsed((v) => !v)}
          />
        </aside>
      ) : null}

      <BlockDrillPanel
        open={blockDrillPanelOpen}
        title={focusedVillageLabel}
        blockLabel={focusedBlockLabel}
        farms={focusedBlockFarms}
        focusedFarmId={focusedBlockFarmId}
        onFarmRowClick={setFocusedBlockFarmId}
        onClose={() => {
          setFocusedBlockVillageKey(null)
          setFocusedBlockFarmId(null)
        }}
      />

      <FilteredFarmsPanel
        open={bottomPanelMode != null}
        mode={bottomPanelMode ?? 'filter'}
        path={filterPath}
        surveyorLabel={panelLabel}
        farms={bottomPanelFarms}
        focusedFarmId={filterFocusedFarmId}
        onFarmRowClick={setFilterFocusedFarmId}
        onClose={() => {
          if (bottomPanelMode === 'surveyor') setPanelSurveyorKey(null)
          else setFilterPanelDismissed(true)
        }}
        rightOffsetPx={bottomPanelRightPx}
      />
    </div>
  )
}
