import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Circle,
  GeoJSON,
  MapContainer,
  Polygon,
  TileLayer,
  ZoomControl,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import { loadDistrictGeojson } from '../utils/loadDistrictGeojson'
import { geoDistrictKey } from '../utils/districtNameMap'
import { ClusterLayer } from './ClusterLayer'
import { ClusterFarmDetailPanel } from './ClusterFarmDetailPanel'
import { VillageDrillLayer } from './VillageDrillLayer'
import { ClusterFarmPinLayer } from './ClusterFarmPinLayer'
import { BlockDrillVillageDots } from './BlockDrillVillageDots'
import { BlockDrillFarmPins } from './BlockDrillFarmPins'
import { getBubbleColor } from '../utils/clusterMapStyle'
import { BOTH_BOUNDS, STATE_BOUNDS } from '../utils/mapBounds'
import { getClusterCoords } from '../utils/districtCentroids'
import { resolveDistrict } from '../utils/districtNameMap'
import { geocodeBlockOnce } from '../utils/blockGeocode'
import { resolveBlockToSubdist } from '../utils/blockNameAlias'
import { getVillageCoords } from '../utils/villageGeo'
import { findVillageCentroidSync } from '../utils/villageCentroid'
import { placeClusterVillagePoints } from '../utils/geocodeBlocks'
import { groupClusterFarmsByVillage, normaliseVillage } from '../utils/groupClusterFarmsByVillage'
import {
  splitFarmsByGps,
  farmGpsCentroid,
} from '../utils/loadFarmGeocodes'
import { computeConvexHullLatLng } from '../utils/convexHull'
import {
  CLUSTER_HULL_PANE,
  CLUSTER_TERRITORY_PANE,
  FARM_DRILL_PINS_PANE,
  VILLAGE_DRILL_DOTS_PANE,
} from '../utils/clusterDrillMapPanes'
import { buildClusterTerritories } from '../utils/clusterTerritories'

const OSM_TILE = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const OSM_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

/** Pan hard limit — Punjab + Haryana envelope (slightly padded beyond state bounds). */
const PH_MAP_MAX_BOUNDS = [
  [26.5, 72.5],
  [33.5, 79.0],
]

const COL = {
  z: '#E8EDE9',
  b1: '#A8C5A0',
  b2: '#5A9E6F',
  b3: '#2E7D52',
  b4: '#1C3A2A',
}

function farmBucketColor(n) {
  if (n <= 0) return COL.z
  if (n <= 50) return COL.b1
  if (n <= 200) return COL.b2
  if (n <= 500) return COL.b3
  return COL.b4
}

/**
 * @param {number} farmCount
 * @param {boolean} selected
 * @param {boolean} hovered
 */
function pathStyle(farmCount, selected, hovered) {
  if (selected) {
    return {
      fillColor: '#D97706',
      fillOpacity: 0.78 + (hovered ? 0.1 : 0),
      color: '#ffffff',
      weight: 3,
      opacity: 1,
    }
  }
  const fill = farmBucketColor(farmCount)
  let fillOpacity = 0.7
  if (hovered) fillOpacity += 0.12
  return {
    fillColor: fill,
    color: '#FFFFFF',
    weight: 1.5,
    fillOpacity,
    opacity: 1,
  }
}

function fmtTip(label, farms, surveyors) {
  const esc = (s) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  return `<div style="font:600 12px/1.35 system-ui,Segoe UI,sans-serif;color:#fff;background:#1C3A2A;border-radius:8px;padding:8px 10px;box-shadow:0 4px 14px rgba(0,0,0,.18);min-width:140px">
  <div style="font-size:13px;margin-bottom:4px;letter-spacing:.02em">${esc(label)}</div>
  <div style="opacity:.92;font-weight:500;font-size:11px">Farms: <span style="font-weight:700">${esc(farms)}</span></div>
  <div style="opacity:.92;font-weight:500;font-size:11px">Surveyors: <span style="font-weight:700">${esc(surveyors)}</span></div>
</div>`
}

/**
 * @param {import('../utils/parseExcel.js').FarmRecord[]} records
 * @param {{ stateKey: string, districtKey: string, blockKey: string, villageKey: string }} selection
 */
function geocodeLabelsFromRecords(records, selection) {
  const hit = records.find((row) => {
    if (selection.stateKey && row._stateKey !== selection.stateKey) return false
    if (selection.districtKey && row._districtKey !== selection.districtKey)
      return false
    if (selection.blockKey && row._blockKey !== selection.blockKey) return false
    if (selection.villageKey && row._villageKey !== selection.villageKey)
      return false
    return true
  })
  if (hit) {
    return {
      state: String(hit.state ?? '').trim(),
      district: String(hit.district ?? '').trim(),
      block: String(hit.block ?? '').trim(),
      village: String(hit.village ?? '').trim(),
    }
  }
  return {
    state:
      selection.stateKey === 'PUNJAB'
        ? 'Punjab'
        : selection.stateKey === 'HARYANA'
          ? 'Haryana'
          : '',
    district: selection.districtKey || '',
    block: selection.blockKey || '',
    village: selection.villageKey || '',
  }
}

/**
 * Convert a selection state key to the abbreviated `st` code used in
 * `PB_HR_Villages.geojson`. Returns `''` if not strictly Punjab /
 * Haryana so the caller can skip state-scoping.
 * @param {string | null | undefined} stateKey
 */
function stateCodeFromKey(stateKey) {
  const k = String(stateKey ?? '').toUpperCase()
  if (k === 'HARYANA') return 'HR'
  if (k === 'PUNJAB') return 'PB'
  return ''
}

/**
 * All village features in the current (state, block) selection,
 * filtered from `PB_HR_Villages.geojson` by the `sd` property
 * (subdistrict / block). Matches both the bare subdistrict value
 * and its ` ST` suffix variant so Haryana sub-tehsils (e.g.
 * `DHAND ST`, `JAKHAL ST`) resolve from a spreadsheet block name
 * that lacks the suffix.
 *
 * Returns `null` when the block is unmapped, the selection lacks a
 * block, or no village feature shares the resolved `sd` value.
 * @param {Array<import('geojson').Feature>} features
 * @param {{ stateKey: string, districtKey: string, blockKey: string }} selection
 */
function findBlockVillageFeatures(features, selection) {
  if (!features?.length || !selection?.blockKey) return null
  const subdist = resolveBlockToSubdist(selection.blockKey)
  if (!subdist) return null
  const subdistSt = `${subdist} ST`
  const stateAbbr = stateCodeFromKey(selection.stateKey)

  const matches = features.filter((f) => {
    const sd = String(f.properties?.sd ?? '').trim().toUpperCase()
    if (sd !== subdist && sd !== subdistSt) return false
    if (
      stateAbbr &&
      String(f.properties?.st ?? '').trim().toUpperCase() !== stateAbbr
    ) {
      return false
    }
    return true
  })
  return matches.length ? matches : null
}

/**
 * Single village polygon matching the full (state, block, village)
 * selection. Required scoping prevents collisions where two villages
 * share a `v` value in different districts.
 *
 * Returns `null` when the village is missing from the GeoJSON — the
 * caller is expected to fall back to a geocoded pulse pin.
 * @param {Array<import('geojson').Feature>} features
 * @param {{ stateKey: string, districtKey: string, blockKey: string, villageKey: string }} selection
 */
function findVillageFeatureBySelection(features, selection) {
  if (!features?.length || !selection?.villageKey) return null
  const targetV = String(selection.villageKey).trim().toLowerCase()
  if (!targetV) return null
  const subdist = selection.blockKey
    ? resolveBlockToSubdist(selection.blockKey)
    : null
  const subdistSt = subdist ? `${subdist} ST` : null
  const stateAbbr = stateCodeFromKey(selection.stateKey)

  for (const f of features) {
    const v = String(f.properties?.v ?? '').trim().toLowerCase()
    if (v !== targetV) continue
    if (subdist) {
      const sd = String(f.properties?.sd ?? '').trim().toUpperCase()
      if (sd !== subdist && sd !== subdistSt) continue
    }
    if (
      stateAbbr &&
      String(f.properties?.st ?? '').trim().toUpperCase() !== stateAbbr
    ) {
      continue
    }
    return f
  }
  return null
}

/**
 * @param {object} geojson
 * @param {string} districtKey
 * @returns {L.LatLngBounds | null}
 */
function getDistrictBoundsFromGeo(geojson, districtKey) {
  if (!geojson?.features?.length || !districtKey) return null
  const feats = geojson.features.filter(
    (f) => geoDistrictKey(f.properties) === districtKey,
  )
  if (!feats.length) return null
  const layer = L.geoJSON({ type: 'FeatureCollection', features: feats })
  const b = layer.getBounds()
  return b.isValid() ? b : null
}

function MapWheelPolicy({ containerRef }) {
  const map = useMap()
  useEffect(() => {
    map.scrollWheelZoom.disable()
  }, [map])

  useMapEvents({
    click() {
      map.scrollWheelZoom.enable()
    },
  })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onLeave = () => {
      map.scrollWheelZoom.disable()
    }
    el.addEventListener('mouseleave', onLeave)
    return () => {
      el.removeEventListener('mouseleave', onLeave)
    }
  }, [map, containerRef])

  return null
}

function MapResizer() {
  const map = useMap()
  useEffect(() => {
    const t = window.setTimeout(() => {
      map.invalidateSize()
    }, 200)
    return () => window.clearTimeout(t)
  }, [map])
  return null
}

/** Hull below village dots; hull pane ignores pointer events so fills never steal clicks. */
function ClusterDrillLeafletPanes() {
  const map = useMap()
  useEffect(() => {
    if (!map.getPane(CLUSTER_TERRITORY_PANE)) {
      map.createPane(CLUSTER_TERRITORY_PANE)
      const el = map.getPane(CLUSTER_TERRITORY_PANE)
      // Below the default overlayPane (400) — fills stay under
      // district/block outlines, the cluster drill hull, and every
      // marker (bubbles / village dots / farm pins).
      el.style.zIndex = '350'
    }
    if (!map.getPane(CLUSTER_HULL_PANE)) {
      map.createPane(CLUSTER_HULL_PANE)
      const el = map.getPane(CLUSTER_HULL_PANE)
      el.style.zIndex = '420'
      el.style.pointerEvents = 'none'
    }
    if (!map.getPane(VILLAGE_DRILL_DOTS_PANE)) {
      map.createPane(VILLAGE_DRILL_DOTS_PANE)
      map.getPane(VILLAGE_DRILL_DOTS_PANE).style.zIndex = '650'
    }
    if (!map.getPane(FARM_DRILL_PINS_PANE)) {
      map.createPane(FARM_DRILL_PINS_PANE)
      map.getPane(FARM_DRILL_PINS_PANE).style.zIndex = '660'
    }
  }, [map])
  return null
}

/**
 * Tiny HTML escape for the territory tooltip.
 * @param {unknown} v
 */
function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Translucent convex-hull territory fill for every cluster with at
 * least three distinct village coordinates. Clicking a territory
 * surfaces the same drill behaviour as clicking the bubble.
 * @param {{
 *   clusters: import('./ClusterLayer.jsx').Cluster[],
 *   visible: boolean,
 *   onClusterClick?: (clusterId: string) => void,
 * }} props
 */
function ClusterTerritoriesLayer({ clusters, visible, onClusterClick }) {
  const map = useMap()
  const groupRef = useRef(/** @type {L.LayerGroup | null} */ (null))

  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.clearLayers()
      groupRef.current.remove()
      groupRef.current = null
    }
    if (!visible) return undefined

    const territories = buildClusterTerritories(clusters)
    if (!territories.length) return undefined

    const group = L.layerGroup()
    for (const { cluster, hull, color } of territories) {
      const poly = L.polygon(hull, {
        pane: CLUSTER_TERRITORY_PANE,
        color,
        weight: 1.5,
        opacity: 0.7,
        fillColor: color,
        fillOpacity: 0.12,
        interactive: true,
      })

      const farms = Number.isFinite(cluster.farms) ? cluster.farms : 0
      const villageCount = cluster.villages?.length ?? 0
      poly.bindTooltip(
        `<div style="font:600 11px/1.35 system-ui,Segoe UI,sans-serif;color:#fff;background:#1C3A2A;border-radius:8px;padding:6px 9px;box-shadow:0 4px 14px rgba(0,0,0,.18);min-width:140px">
          <div style="font-size:12px;margin-bottom:3px">${escapeHtml(cluster.cluster_name)}</div>
          <div style="opacity:.92;font-weight:500;font-size:10.5px">
            Farms: <span style="font-weight:700">${farms.toLocaleString('en-IN')}</span>
            · Villages: <span style="font-weight:700">${villageCount}</span>
          </div>
        </div>`,
        {
          direction: 'top',
          sticky: true,
          opacity: 1,
          className: '!bg-transparent !border-0 !shadow-none farm-map-tip',
        },
      )

      poly.on('click', () => onClusterClick?.(cluster.cluster_id))
      group.addLayer(poly)
    }

    group.addTo(map)
    groupRef.current = group

    return () => {
      if (groupRef.current) {
        groupRef.current.clearLayers()
        groupRef.current.remove()
        groupRef.current = null
      }
    }
  }, [map, clusters, visible, onClusterClick])

  return null
}

/**
 * Amber district outline drawn imperatively so it sits above the
 * existing GeoJSON choropleth fill (and also works in cluster mode
 * where the choropleth isn't rendered).
 * @param {{ feature: import('geojson').Feature | null }} props
 */
function DistrictBoundaryHighlight({ feature }) {
  const map = useMap()
  const layerRef = useRef(/** @type {L.GeoJSON | null} */ (null))

  useEffect(() => {
    if (layerRef.current) {
      layerRef.current.remove()
      layerRef.current = null
    }
    if (!feature) return undefined

    const layer = L.geoJSON(feature, {
      interactive: false,
      style: {
        color: '#D97706',
        weight: 2.5,
        fill: false,
      },
      onEachFeature: (_f, lyr) => {
        const opts = /** @type {{ interactive?: boolean }} */ (
          lyr.options ?? {}
        )
        opts.interactive = false
      },
    }).addTo(map)
    layerRef.current = layer

    return () => {
      if (layerRef.current) {
        layerRef.current.remove()
        layerRef.current = null
      }
    }
  }, [feature, map])

  return null
}

/**
 * Dark-green block outline. Two tiers:
 *   - `blockVillages` — every village polygon sharing the block's
 *     `sd` value, rendered as a FeatureCollection with a faint
 *     green fill so the individual census cells are visible
 *     (opspilot-style).
 *   - `district` — dashed parent-district outline (used when no
 *     village in the GeoJSON matches the selected block).
 *
 * Skipped silently when neither shape is available.
 * @param {{
 *   shape:
 *     | { kind: 'blockVillages', features: import('geojson').Feature[] }
 *     | { kind: 'district', feature: import('geojson').Feature }
 *     | null
 * }} props
 */
function BlockBoundaryHighlight({ shape }) {
  const map = useMap()
  const layerRef = useRef(/** @type {L.GeoJSON | null} */ (null))

  useEffect(() => {
    if (layerRef.current) {
      layerRef.current.remove()
      layerRef.current = null
    }
    if (!shape) return undefined

    let data
    let style
    if (shape.kind === 'blockVillages') {
      data = {
        type: /** @type {const} */ ('FeatureCollection'),
        features: shape.features,
      }
      style = {
        color: '#1C3A2A',
        weight: 1.5,
        opacity: 1,
        fillColor: '#1C3A2A',
        fillOpacity: 0.06,
      }
    } else {
      data = shape.feature
      style = {
        color: '#1C3A2A',
        weight: 1.5,
        fill: false,
        dashArray: '6 4',
      }
    }

    const layer = L.geoJSON(data, {
      interactive: false,
      style,
      onEachFeature: (_f, lyr) => {
        const opts = /** @type {{ interactive?: boolean }} */ (
          lyr.options ?? {}
        )
        opts.interactive = false
      },
    }).addTo(map)
    layerRef.current = layer

    return () => {
      if (layerRef.current) {
        layerRef.current.remove()
        layerRef.current = null
      }
    }
  }, [shape, map])

  return null
}

/**
 * Amber single-village polygon (10% fill, weight 2). Sits above the
 * block's village cells so the selected village reads as the lead
 * shape inside its block.
 * @param {{ feature: import('geojson').Feature | null }} props
 */
function VillageBoundaryHighlight({ feature }) {
  const map = useMap()
  const layerRef = useRef(/** @type {L.GeoJSON | null} */ (null))

  useEffect(() => {
    if (layerRef.current) {
      layerRef.current.remove()
      layerRef.current = null
    }
    if (!feature) return undefined

    const layer = L.geoJSON(feature, {
      interactive: false,
      style: {
        color: '#D97706',
        weight: 2,
        opacity: 1,
        fillColor: '#D97706',
        fillOpacity: 0.1,
      },
      onEachFeature: (_f, lyr) => {
        const opts = /** @type {{ interactive?: boolean }} */ (
          lyr.options ?? {}
        )
        opts.interactive = false
      },
    }).addTo(map)
    layerRef.current = layer

    return () => {
      if (layerRef.current) {
        layerRef.current.remove()
        layerRef.current = null
      }
    }
  }, [feature, map])

  return null
}

/**
 * Pulsing amber pin used to mark a geocoded village (or fallback
 * block centroid) when no real boundary polygon is available.
 * @param {{ position: [number, number] | null }} props
 */
function PulseAtPoint({ position }) {
  const map = useMap()
  const layerRef = useRef(/** @type {L.Marker | null} */ (null))

  useEffect(() => {
    if (layerRef.current) {
      layerRef.current.remove()
      layerRef.current = null
    }
    if (!position) return undefined

    const icon = L.divIcon({
      className: 'farm-village-pin',
      html: `
        <div class="farm-village-pin__ring"></div>
        <div class="farm-village-pin__dot"></div>
      `,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    })

    const marker = L.marker(position, {
      icon,
      interactive: false,
      keyboard: false,
    }).addTo(map)
    layerRef.current = marker

    return () => {
      if (layerRef.current) {
        layerRef.current.remove()
        layerRef.current = null
      }
    }
  }, [position, map])

  return null
}

const LEGEND_ROWS = [
  { c: COL.z, t: '0 farms' },
  { c: COL.b1, t: '1–50' },
  { c: COL.b2, t: '51–200' },
  { c: COL.b3, t: '201–500' },
  { c: COL.b4, t: '500+' },
]

const CLUSTER_LEGEND = [
  { c: getBubbleColor(0), t: '< 30 farms' },
  { c: getBubbleColor(30), t: '30–99' },
  { c: getBubbleColor(100), t: '100–299' },
  { c: getBubbleColor(300), t: '300+' },
]

export const MapPanel = forwardRef(function MapPanel(
  {
    data: _data,
    filteredData,
    selection,
    records = [],
    onDistrictClick,
    onStateScopeChange,
    mapMode = 'districts',
    onMapModeChange,
    clusters = [],
    selectedClusterId = null,
    onClusterClick,
    onClusterDrillExit,
    blockGeoWarmProgress = 100,
    villageGeoCache = /** @type {Record<string, [number, number]>} */ ({}),
    farmGeoCache = /** @type {Record<string, [number, number]>} */ ({}),
    /** When true, suppress the in-map state/scope/mode toggle pills so
     *  the parent can render them in a floating UI overlay instead. */
    hideToolbar = false,
    /** Optional controlled prop for the territories overlay; when
     *  provided, replaces internal state so the parent owns the value
     *  and can render its own toggle pill. */
    territoriesVisible: territoriesVisibleProp,
    onTerritoriesVisibleChange,
    /** Fires whenever the selected block's boundary availability flips
     *  — `true` when an LGD/village-union polygon is rendering,
     *  `false` when only the dashed district outline is available, and
     *  `null` when no block is selected. */
    onBlockBoundaryStateChange,
    /** Uppercase `_villageKey` of the village the user has drilled
     *  into inside the selected block (Level-2 of the drill).
     *  `null` means no village is in focus yet. */
    focusedBlockVillageKey = null,
    /** Setter for `focusedBlockVillageKey`; receives `null` to clear. */
    onFocusedBlockVillageChange,
    /** Farm ID whose popup is open / row highlighted (Level-3). */
    focusedBlockFarmId = null,
    /** Setter for `focusedBlockFarmId`; receives `null` to clear. */
    onFocusedBlockFarmChange,
  },
  ref,
) {
  void _data
  const wrapRef = useRef(null)
  const mapRef = useRef(/** @type {L.Map | null} */ (null))
  const recordsRef = useRef(records)
  const farmGeoCacheRef = useRef(farmGeoCache)
  const layerByDistrict = useRef(new Map())

  useEffect(() => {
    recordsRef.current = records
  }, [records])

  useEffect(() => {
    farmGeoCacheRef.current = farmGeoCache
  }, [farmGeoCache])

  const [geo, setGeo] = useState(/** @type {object | null} */ (null))
  const [loadErr, setLoadErr] = useState(/** @type {string | null} */ (null))
  const [hovered, setHovered] = useState(/** @type {string | null} */ (null))
  const [pulseAt, setPulseAt] = useState(/** @type {[number, number] | null} */ (null))
  const [mapReadyTick, setMapReadyTick] = useState(0)

  const [villageFeatures, setVillageFeatures] = useState(
    /** @type {Array<import('geojson').Feature>} */ ([]),
  )
  /** True once `PB_HR_Villages.geojson` has resolved (success or fail).
   *  Used by the flyTo effect to defer the district-fallback fly when a
   *  block is selected but village features haven't arrived yet, so the
   *  map doesn't hop to the district before settling on the union of
   *  village cells. */
  const [villagesLoaded, setVillagesLoaded] = useState(false)
  const [territoriesVisibleInternal, setTerritoriesVisibleInternal] =
    useState(false)
  const territoriesVisible =
    territoriesVisibleProp !== undefined
      ? Boolean(territoriesVisibleProp)
      : territoriesVisibleInternal
  const setTerritoriesVisible = useCallback(
    (next) => {
      const value =
        typeof next === 'function' ? next(territoriesVisible) : Boolean(next)
      if (onTerritoriesVisibleChange) onTerritoriesVisibleChange(value)
      if (territoriesVisibleProp === undefined) {
        setTerritoriesVisibleInternal(value)
      }
    },
    [territoriesVisible, territoriesVisibleProp, onTerritoriesVisibleChange],
  )

  /** True while user is in a drill session (don’t overwrite pre-drill when switching selected cluster). */
  const drillSessionActiveRef = useRef(false)
  /** @type {import('react').MutableRefObject<{ clusterId: string, clusterName: string, clusterRollupFarms: number, points: Array<{ lat: number, lon: number, farms: number, acres: number, village: string, block: string, district: string }>, farms: import('../utils/parseExcel.js').FarmRecord[] } | null>} */
  const clusterDrillRef = useRef(null)

  const [clusterDrill, setClusterDrill] = useState(null)
  /** True while geocoding / flying into a cluster — suppresses FitClusterBounds and cluster bubbles. */
  const [drillPending, setDrillPending] = useState(false)
  const [farmPanelOpen, setFarmPanelOpen] = useState(false)
  /** @type {import('react').MutableRefObject<number>} */
  const villageFlyTokenRef = useRef(0)
  /** @type {import('react').MutableRefObject<ReturnType<typeof setTimeout> | null>} */
  const villageFlyTimeoutRef = useRef(null)
  const [drillFarmPins, setDrillFarmPins] = useState(
    /** @type {Array<{ farm: import('../utils/parseExcel.js').FarmRecord, position: [number, number] }>} */ (
      []
    ),
  )
  const [drillSelectedVillageNorm, setDrillSelectedVillageNorm] = useState(
    /** @type {string | null} */ (null),
  )

  /** @typedef {{ kind: 'polygon', ring: [number, number][] } | { kind: 'circle', center: [number, number], radiusMeters: number }} ClusterDrillBoundary */
  const clusterDrillBoundary = useMemo(() => {
    if (!clusterDrill?.points?.length) return null
    const coords = clusterDrill.points
      .filter(
        (p) =>
          p.lat != null &&
          p.lon != null &&
          Number.isFinite(p.lat) &&
          Number.isFinite(p.lon),
      )
      .map((p) => /** @type {[number, number]} */ ([p.lat, p.lon]))
    if (coords.length === 0) return null

    if (coords.length === 1) {
      return /** @type {ClusterDrillBoundary} */ ({
        kind: 'circle',
        center: coords[0],
        radiusMeters: 2000,
      })
    }

    if (coords.length === 2) {
      const ll0 = L.latLng(coords[0][0], coords[0][1])
      const ll1 = L.latLng(coords[1][0], coords[1][1])
      const d = ll0.distanceTo(ll1)
      const c = L.latLngBounds(ll0, ll1).getCenter()
      return /** @type {ClusterDrillBoundary} */ ({
        kind: 'circle',
        center: [c.lat, c.lng],
        radiusMeters: Math.max((d / 2) * 1.25, 2000),
      })
    }

    const hull = computeConvexHullLatLng(coords)
    if (hull.length >= 3) {
      return /** @type {ClusterDrillBoundary} */ ({ kind: 'polygon', ring: hull })
    }
    if (hull.length === 2) {
      const ll0 = L.latLng(hull[0][0], hull[0][1])
      const ll1 = L.latLng(hull[1][0], hull[1][1])
      const d = ll0.distanceTo(ll1)
      const c = L.latLngBounds(ll0, ll1).getCenter()
      return /** @type {ClusterDrillBoundary} */ ({
        kind: 'circle',
        center: [c.lat, c.lng],
        radiusMeters: Math.max((d / 2) * 1.25, 2000),
      })
    }
    return /** @type {ClusterDrillBoundary} */ ({
      kind: 'circle',
      center: coords[0],
      radiusMeters: 2000,
    })
  }, [clusterDrill?.points])

  const stateKey = selection?.stateKey ?? ''
  const selectedDistrict = selection?.districtKey ?? ''
  const blockKey = selection?.blockKey ?? ''
  const villageKey = selection?.villageKey ?? ''

  const districtMetrics = useMemo(() => {
    const m = new Map()
    for (const row of filteredData) {
      const k = row._districtKey
      if (!k) continue
      if (!m.has(k)) {
        m.set(k, {
          farmIds: new Set(),
          surveyors: new Set(),
        })
      }
      const x = m.get(k)
      x.farmIds.add(row.farmId)
      x.surveyors.add(row.surveyorKey)
    }
    return m
  }, [filteredData])

  useLayoutEffect(() => {
    layerByDistrict.current.clear()
  }, [geo])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { geojson, errors } = await loadDistrictGeojson()
      if (cancelled) return
      if (!geojson.features.length) {
        setLoadErr(
          errors.join(' · ') ||
            'Map data unavailable — use dropdowns to filter',
        )
        setGeo(null)
        return
      }
      setLoadErr(errors.length ? errors.join(' · ') : null)

      setGeo(geojson)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch('/geo/PB_HR_Villages.geojson')
      .then((r) => {
        if (!r.ok) throw new Error(`Villages GeoJSON HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => {
        if (cancelled) return
        const feats = Array.isArray(data?.features) ? data.features : []
        setVillageFeatures(feats)
        // eslint-disable-next-line no-console
        console.log('Villages loaded:', feats.length)
      })
      .catch((err) => {
        if (cancelled) return
        console.warn('Villages GeoJSON load failed:', err)
        setVillageFeatures([])
      })
      .finally(() => {
        if (!cancelled) setVillagesLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  /** Canonical-uppercase district key → bundled GeoJSON feature. */
  const districtFeatureIndex = useMemo(() => {
    /** @type {Map<string, import('geojson').Feature>} */
    const m = new Map()
    const feats = geo?.features ?? []
    for (const f of feats) {
      const key = geoDistrictKey(f.properties)
      if (key && !m.has(key)) m.set(key, f)
    }
    return m
  }, [geo])

  const selectedDistrictFeature = useMemo(() => {
    if (!selection?.districtKey) return null
    return districtFeatureIndex.get(selection.districtKey) ?? null
  }, [districtFeatureIndex, selection?.districtKey])

  const selectedBlockVillageFeatures = useMemo(
    () => findBlockVillageFeatures(villageFeatures, selection ?? {}),
    [villageFeatures, selection],
  )

  const selectedVillageFeature = useMemo(
    () => findVillageFeatureBySelection(villageFeatures, selection ?? {}),
    [villageFeatures, selection],
  )

  /**
   * Tier-1: union of every village polygon in the selected block.
   * Tier-2 (fallback): dashed parent-district outline when the block
   * isn't represented in the village GeoJSON. The new "village
   * union" tier intentionally has a faint green fill so individual
   * cells are visible inside the block — that's the opspilot look.
   * @typedef {{ kind: 'blockVillages', features: import('geojson').Feature[] }
   *   | { kind: 'district', feature: import('geojson').Feature }} BlockHighlightShape
   */
  const blockHighlightShape = useMemo(() => {
    if (!selection?.blockKey) return null
    if (selectedBlockVillageFeatures?.length) {
      return /** @type {const} */ ({
        kind: 'blockVillages',
        features: selectedBlockVillageFeatures,
      })
    }
    if (!selectedDistrictFeature) return null
    return /** @type {const} */ ({
      kind: 'district',
      feature: selectedDistrictFeature,
    })
  }, [
    selection?.blockKey,
    selectedBlockVillageFeatures,
    selectedDistrictFeature,
  ])

  // Emit boundary-availability whenever the highlight shape transitions
  // so the parent can render the "Block boundary unavailable" badge.
  useEffect(() => {
    if (!onBlockBoundaryStateChange) return
    if (!selection?.blockKey) {
      onBlockBoundaryStateChange(null)
      return
    }
    onBlockBoundaryStateChange(blockHighlightShape?.kind === 'blockVillages')
  }, [
    blockHighlightShape,
    selection?.blockKey,
    onBlockBoundaryStateChange,
  ])

  /** Farms in the currently-selected block (memoised by block key). */
  const blockFarms = useMemo(() => {
    const bk = selection?.blockKey
    if (!bk || !records?.length) return []
    return records.filter((r) => r._blockKey === bk)
  }, [records, selection?.blockKey])

  /** Farms in the currently-focused village inside the block. */
  const focusedVillageFarms = useMemo(() => {
    if (!focusedBlockVillageKey || !blockFarms.length) return []
    return blockFarms.filter((r) => r._villageKey === focusedBlockVillageKey)
  }, [blockFarms, focusedBlockVillageKey])

  /** GeoJSON feature + centroid for the focused village (Level-2 fly).
   *  We always look up the village polygon (used for `flyToBounds`) but
   *  override the displayed centroid with the GPS centroid of the
   *  village's farms whenever we have enough survey points — those sit
   *  exactly over the cluster of pins, not over the village's
   *  administrative centre. */
  const focusedVillageGeo = useMemo(() => {
    if (!focusedBlockVillageKey) return null
    const hit = focusedVillageFarms[0]
    if (!hit) return null
    const sub = resolveBlockToSubdist(selection?.blockKey ?? '') || ''
    const stU = String(selection?.stateKey ?? '').toUpperCase()
    const stateAbbr =
      stU === 'HARYANA' ? 'HR' : stU === 'PUNJAB' ? 'PB' : ''
    const fallback = findVillageCentroidSync({
      villageName: hit.village,
      blockName: selection?.blockKey ?? '',
      villageFeatures,
      villageGeoCache,
      subdist: sub,
      stateAbbr,
    })
    const gps = farmGpsCentroid(focusedVillageFarms, farmGeoCache)
    if (gps) {
      return {
        coords: gps,
        feature: fallback?.feature ?? null,
      }
    }
    return fallback
  }, [
    focusedBlockVillageKey,
    focusedVillageFarms,
    villageFeatures,
    villageGeoCache,
    farmGeoCache,
    selection?.blockKey,
    selection?.stateKey,
  ])

  // Whenever the selection changes (block/village/state), drop any
  // active village + farm focus so we never leak Level-2/3 layers
  // from a previous block.
  useEffect(() => {
    if (onFocusedBlockVillageChange) onFocusedBlockVillageChange(null)
    if (onFocusedBlockFarmChange) onFocusedBlockFarmChange(null)
    // Reset only when the *block* changes — not when the user just
    // hovers a different district.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection?.blockKey, selection?.stateKey])

  const applyLayerPresentation = useCallback(() => {
    const metrics = districtMetrics
    layerByDistrict.current.forEach((layer, key) => {
      const meta = metrics.get(key)
      const farmN = meta ? meta.farmIds.size : 0
      const surveyN = meta ? meta.surveyors.size : 0
      const lyrMeta = /** @type {{ _districtLabel?: string }} */ (layer)
      const label = lyrMeta._districtLabel || key
      const tip =
        typeof layer.getTooltip === 'function' ? layer.getTooltip() : null
      if (tip) tip.setContent(fmtTip(label, farmN, surveyN))
    })
  }, [districtMetrics])

  useEffect(() => {
    applyLayerPresentation()
  }, [geo, applyLayerPresentation])

  const featureStyle = useCallback(
    (feature) => {
      const key = geoDistrictKey(feature.properties)
      const meta = districtMetrics.get(key)
      const farmN = meta ? meta.farmIds.size : 0
      const sel = selectedDistrict === key
      const hov = hovered === key
      return pathStyle(farmN, sel, hov)
    },
    [districtMetrics, selectedDistrict, hovered],
  )

  const onEachFeature = useCallback(
    (feature, layer) => {
      const key = geoDistrictKey(feature.properties)
      if (!key) return
      layerByDistrict.current.set(key, layer)
      const labelRaw =
        feature.properties?.DISTRICT ??
        feature.properties?.NAME_2 ??
        key
      const lyr = /** @type {{ _districtLabel?: string }} */ (layer)
      lyr._districtLabel = String(labelRaw)
      layer.on({
        click(ev) {
          L.DomEvent.stopPropagation(ev)
          const map = /** @type {{ _map?: L.Map }} */ (layer)._map
          map?.scrollWheelZoom?.enable()
          const st = String(feature.properties?._MAP_STATE_KEY ?? '')
          onDistrictClick(key, st)
        },
      })
      layer.bindTooltip(' ', {
        sticky: true,
        direction: 'top',
        opacity: 1,
        className: '!bg-transparent !border-0 !shadow-none farm-map-tip',
      })
      layer.on('mouseover', () => setHovered(key))
      layer.on('mouseout', () => setHovered(null))
    },
    [onDistrictClick],
  )

  useImperativeHandle(
    ref,
    () => ({
      flyToDistrict(districtKey) {
        const map = mapRef.current
        if (!map || !districtKey) return
        const layer = layerByDistrict.current.get(districtKey)
        const b =
          layer && typeof layer.getBounds === 'function'
            ? layer.getBounds()
            : geo
              ? getDistrictBoundsFromGeo(geo, districtKey)
              : null
        if (b?.isValid?.()) {
          map.flyToBounds(b, { padding: [40, 40], maxZoom: 10 })
        }
      },
      flyToCluster(lat, lon, zoom = 11) {
        const map = mapRef.current
        if (!map || lat == null || lon == null) return
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return
        map.flyTo([lat, lon], zoom, { animate: true })
      },
    }),
    [geo],
  )

  useEffect(() => {
    clusterDrillRef.current = clusterDrill
  }, [clusterDrill])

  useEffect(() => {
    if (mapMode !== 'clusters') {
      drillSessionActiveRef.current = false
      queueMicrotask(() => {
        setDrillPending(false)
        setClusterDrill(null)
        setFarmPanelOpen(false)
        villageFlyTokenRef.current += 1
        setDrillFarmPins([])
        setDrillSelectedVillageNorm(null)
      })
      return
    }
    if (!selectedClusterId) {
      const map = mapRef.current
      const had = clusterDrillRef.current
      if (had && map && mapMode === 'clusters') {
        const sb =
          stateKey && STATE_BOUNDS[stateKey] ? STATE_BOUNDS[stateKey] : BOTH_BOUNDS
        map.flyToBounds(L.latLngBounds(sb[0], sb[1]), {
          padding: [30, 30],
          duration: 1.0,
        })
      }
      drillSessionActiveRef.current = false
      queueMicrotask(() => {
        setDrillPending(false)
        setClusterDrill(null)
        setFarmPanelOpen(false)
        villageFlyTokenRef.current += 1
        setDrillFarmPins([])
        setDrillSelectedVillageNorm(null)
      })
      return
    }

    const cluster = clusters.find((c) => c.cluster_id === selectedClusterId)
    if (!cluster?.villages?.length) {
      queueMicrotask(() => {
        setDrillPending(false)
        setClusterDrill(null)
        setFarmPanelOpen(false)
        villageFlyTokenRef.current += 1
        setDrillFarmPins([])
        setDrillSelectedVillageNorm(null)
      })
      return
    }

    const map = mapRef.current
    if (map && !drillSessionActiveRef.current) {
      drillSessionActiveRef.current = true
    }

    queueMicrotask(() => {
      setDrillPending(true)
      villageFlyTokenRef.current += 1
      setDrillFarmPins([])
      setDrillSelectedVillageNorm(null)
      setClusterDrill((prev) =>
        prev && prev.clusterId !== selectedClusterId ? null : prev,
      )
    })

    let cancelled = false
    const flyOpts = { padding: [50, 50], maxZoom: 12, duration: 1.4 }

    const map2 = mapRef.current
    if (!map2) {
      queueMicrotask(() => setDrillPending(false))
      return () => {
        cancelled = true
      }
    }

    const rawPoints = placeClusterVillagePoints(cluster.villages)
    const { farmsByVillage, allFarms } = groupClusterFarmsByVillage(
      cluster.villages,
      recordsRef.current,
    )

    if (import.meta.env?.DEV) {
      console.log('[cluster click] villages:', cluster.villages.length)
      console.log('[cluster click] farms from join:', allFarms.length)
      console.log(
        '[cluster click] villages with farms:',
        [...farmsByVillage.values()].filter((arr) => arr.length > 0).length,
      )
      console.log(
        '[cluster click] farmsByVillage keys:',
        [...farmsByVillage.keys()],
      )
    }

    // Re-position each village dot at the GPS centroid of its joined
    // farms when available — this guarantees the dot sits where the
    // actual surveyed farms are, even when the cluster CSV's block
    // metadata is slightly off. Falls back to the CSV-derived position
    // computed by `placeClusterVillagePoints` for villages that have no
    // joined farms with GPS.
    const points = rawPoints.map((p) => {
      const vKey = normaliseVillage(p.village)
      const spreadsheetFarms = vKey ? farmsByVillage.get(vKey) ?? [] : []
      const gpsCentroid = spreadsheetFarms.length
        ? farmGpsCentroid(spreadsheetFarms, farmGeoCacheRef.current)
        : null
      if (gpsCentroid) {
        return {
          ...p,
          lat: gpsCentroid[0],
          lon: gpsCentroid[1],
          spreadsheetFarms,
        }
      }
      return { ...p, spreadsheetFarms }
    })

    const applyDrill = () => {
      if (cancelled) return
      setDrillFarmPins([])
      setDrillSelectedVillageNorm(null)
      setClusterDrill({
        clusterId: cluster.cluster_id,
        clusterName: cluster.cluster_name,
        clusterRollupFarms: cluster.farms,
        points,
        farms: allFarms,
        farmsByVillage,
      })
      setDrillPending(false)
      queueMicrotask(() => setFarmPanelOpen(true))
    }

    const onMoveEnd = () => {
      map2.off('moveend', onMoveEnd)
      applyDrill()
    }

    let moveEndAttached = false
    if (points.length) {
      const b = L.latLngBounds(points.map((p) => [p.lat, p.lon]))
      if (b.isValid()) {
        map2.once('moveend', onMoveEnd)
        moveEndAttached = true
        map2.flyToBounds(b, flyOpts)
      }
    }
    if (!moveEndAttached) {
      const dk =
        cluster.districtKey ||
        (cluster.villages[0]?.district
          ? resolveDistrict(cluster.villages[0].district)
          : '')
      const distCoords = dk ? getClusterCoords(dk) : null
      if (distCoords) {
        map2.once('moveend', onMoveEnd)
        moveEndAttached = true
        map2.flyTo(distCoords, 11, {
          animate: true,
          duration: 1.2,
        })
      } else if (
        cluster.lat != null &&
        cluster.lon != null &&
        Number.isFinite(cluster.lat) &&
        Number.isFinite(cluster.lon)
      ) {
        map2.once('moveend', onMoveEnd)
        moveEndAttached = true
        map2.flyTo([cluster.lat, cluster.lon], 11, {
          animate: true,
          duration: 1.2,
        })
      } else {
        applyDrill()
      }
    }

    return () => {
      cancelled = true
      if (moveEndAttached) map2.off('moveend', onMoveEnd)
      queueMicrotask(() => setDrillPending(false))
    }
  }, [mapMode, selectedClusterId, clusters, stateKey])

  const handleVillageDrillDotClick = useCallback((point) => {
    const map = mapRef.current
    const drill = clusterDrillRef.current
    if (!map || !drill) return

    const villageNorm = normaliseVillage(point.village)
    /** @type {import('../utils/parseExcel.js').FarmRecord[]} */
    const villageFarms =
      Array.isArray(point.spreadsheetFarms) && point.spreadsheetFarms.length
        ? point.spreadsheetFarms
        : drill.farmsByVillage?.get?.(villageNorm) ?? []

    if (import.meta.env?.DEV) {
      console.log(
        '[dot click] vKey:', villageNorm,
        '| farms:', villageFarms.length,
        '| geoCache size:', Object.keys(farmGeoCacheRef.current ?? {}).length,
      )
    }
    if (!villageFarms.length) {
      if (import.meta.env?.DEV) {
        console.warn('[dot click] farms[] is empty for', point.village)
      }
      return
    }

    if (villageFlyTimeoutRef.current != null) {
      window.clearTimeout(villageFlyTimeoutRef.current)
      villageFlyTimeoutRef.current = null
    }

    villageFlyTokenRef.current += 1
    const token = villageFlyTokenRef.current

    setDrillSelectedVillageNorm(villageNorm)

    const centerLat = point.lat
    const centerLng = point.lon

    let placed = false
    const placePins = () => {
      if (placed || token !== villageFlyTokenRef.current) return
      placed = true
      if (villageFlyTimeoutRef.current != null) {
        window.clearTimeout(villageFlyTimeoutRef.current)
        villageFlyTimeoutRef.current = null
      }
      const cache = farmGeoCacheRef.current
      const { withGps, withoutGps } = splitFarmsByGps(villageFarms, cache)
      const ringSize = withoutGps.length <= 3 ? 0.0002 : 0.0003
      /** @type {Array<{ farm: import('../utils/parseExcel.js').FarmRecord, position: [number, number] }>} */
      const pins = withGps.map(({ farm, coords }) => ({
        farm,
        position: coords,
      }))
      withoutGps.forEach((farm, i) => {
        const angle =
          (i / Math.max(withoutGps.length, 1)) * 2 * Math.PI
        const r =
          withoutGps.length === 1 ? 0 : ringSize * Math.ceil(i / 8 + 1)
        pins.push({
          farm,
          position: /** @type {[number, number]} */ ([
            centerLat + r * Math.sin(angle),
            centerLng + r * Math.cos(angle),
          ]),
        })
      })
      setDrillFarmPins(pins)
      if (import.meta.env?.DEV) {
        console.log(
          `[placePins] total: ${villageFarms.length}, GPS: ${withGps.length}, spiral: ${withoutGps.length}`,
        )
        console.log(
          '[pins placed]',
          pins.length,
          'for village',
          point.village,
        )
      }
    }

    // Skip the moveend wait when the map is already over the village —
    // a `flyTo` that doesn't move never fires `moveend`, which used to
    // leave us hanging on the 1.3 s safety timeout before any pins
    // could appear. Distance < 500 m AND zoom within 1 step counts as
    // "already there".
    const TARGET_ZOOM = 14
    const target = L.latLng(centerLat, centerLng)
    const currentZoom = map.getZoom()
    const currentDist =
      typeof map.getCenter === 'function'
        ? map.getCenter().distanceTo(target)
        : Infinity

    if (currentDist < 500 && currentZoom >= TARGET_ZOOM - 1) {
      placePins()
    } else {
      map.once('moveend', placePins)
      map.flyTo([centerLat, centerLng], TARGET_ZOOM, {
        duration: 0.8,
        animate: true,
      })
      // Safety fallback: place pins anyway if `moveend` never fires.
      villageFlyTimeoutRef.current = window.setTimeout(placePins, 1300)
    }
  }, [])

  const handleBackToClusters = useCallback(() => {
    if (villageFlyTimeoutRef.current != null) {
      window.clearTimeout(villageFlyTimeoutRef.current)
      villageFlyTimeoutRef.current = null
    }
    villageFlyTokenRef.current += 1
    setDrillFarmPins([])
    setDrillSelectedVillageNorm(null)
    drillSessionActiveRef.current = false
    onClusterDrillExit?.()
  }, [onClusterDrillExit])

  // "Show all farms in cluster" — bypasses the per-village dot flow and
  // drops a pin at the GPS coord of every joined farm (84% of the
  // dataset). Farms without GPS spiral around their village dot, so we
  // never lose one. This is the safety net for villages whose CSV
  // name disagrees with the spreadsheet beyond what the fuzzy tier can
  // catch — the user can always reach every farm in two clicks.
  const handleShowAllClusterFarms = useCallback(() => {
    const map = mapRef.current
    const drill = clusterDrillRef.current
    if (!map || !drill) return

    if (villageFlyTimeoutRef.current != null) {
      window.clearTimeout(villageFlyTimeoutRef.current)
      villageFlyTimeoutRef.current = null
    }
    villageFlyTokenRef.current += 1
    setDrillSelectedVillageNorm(null)

    const cache = farmGeoCacheRef.current ?? {}
    /** @type {Array<{ farm: import('../utils/parseExcel.js').FarmRecord, position: [number, number] }>} */
    const pins = []
    let withGps = 0
    let spiral = 0

    for (const point of drill.points ?? []) {
      const farms = Array.isArray(point.spreadsheetFarms)
        ? point.spreadsheetFarms
        : []
      if (!farms.length) continue
      const { withGps: g, withoutGps: ng } = splitFarmsByGps(farms, cache)
      for (const { farm, coords } of g) {
        pins.push({ farm, position: coords })
        withGps += 1
      }
      const ringSize = ng.length <= 3 ? 0.0002 : 0.0003
      ng.forEach((farm, i) => {
        const angle = (i / Math.max(ng.length, 1)) * 2 * Math.PI
        const r = ng.length === 1 ? 0 : ringSize * Math.ceil(i / 8 + 1)
        pins.push({
          farm,
          position: /** @type {[number, number]} */ ([
            point.lat + r * Math.sin(angle),
            point.lon + r * Math.cos(angle),
          ]),
        })
        spiral += 1
      })
    }

    setDrillFarmPins(pins)
    if (import.meta.env?.DEV) {
      console.log(
        `[show all] total: ${pins.length}, GPS: ${withGps}, spiral: ${spiral}`,
      )
    }

    if (pins.length) {
      const bounds = L.latLngBounds(pins.map((p) => p.position))
      if (bounds.isValid()) {
        map.flyToBounds(bounds, {
          padding: [50, 50],
          maxZoom: 13,
          duration: 0.8,
        })
      }
    }
  }, [])

  const clusterFitBoundsFromMarkers =
    mapMode === 'clusters' &&
    stateKey !== 'PUNJAB' &&
    stateKey !== 'HARYANA'

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const empty =
      !stateKey && !selectedDistrict && !blockKey && !villageKey

    const bothLL = L.latLngBounds(BOTH_BOUNDS[0], BOTH_BOUNDS[1])

    if (empty) {
      queueMicrotask(() => setPulseAt(null))
      map.flyToBounds(bothLL, { padding: [20, 20] })
      return
    }

    let cancelled = false

    const run = async () => {
      // ── Loading-race guard ──────────────────────────────────────
      // If the user picked a block / village but the village GeoJSON
      // hasn't finished loading, don't fall back to the parent
      // district — that produces a visible "hop" once features
      // arrive and we re-fly to the real polygon. Skip this run; the
      // effect will re-fire as soon as `villageFeatures` /
      // `selectedBlockVillageFeatures` updates.
      if (blockKey && !villagesLoaded) return

      // Bounds of the union of village polygons for the selected
      // block (opspilot-style "block = union of subdistrict
      // villages"). Always the preferred Tier-1 source.
      const blockVillageBounds =
        blockHighlightShape?.kind === 'blockVillages'
          ? L.geoJSON({
              type: 'FeatureCollection',
              features: blockHighlightShape.features,
            }).getBounds()
          : null

      // Tier-2 (parent-district outline) — used when no village in
      // the GeoJSON shares the selected block's `sd` value.
      const districtFallbackBounds =
        blockHighlightShape?.kind === 'district'
          ? L.geoJSON(blockHighlightShape.feature).getBounds()
          : null

      // Tier-1 for villages: exact polygon from the GeoJSON.
      const villagePolygonBounds = selectedVillageFeature
        ? L.geoJSON(selectedVillageFeature).getBounds()
        : null

      if (villageKey && blockKey && selectedDistrict && stateKey) {
        if (villagePolygonBounds?.isValid()) {
          queueMicrotask(() => setPulseAt(null))
          map.flyToBounds(villagePolygonBounds, {
            padding: [30, 30],
            maxZoom: 14,
            duration: 1.0,
          })
          return
        }
        // No village polygon → fall back to the geocoded pulse pin.
        const labels = geocodeLabelsFromRecords(records, selection)
        const { coords: pos, source } = await getVillageCoords(
          labels.village,
          labels.block,
          labels.district,
          labels.state || 'Punjab',
          villageGeoCache,
        )
        if (cancelled || mapRef.current !== map) return
        // eslint-disable-next-line no-console
        console.log('village source:', source, pos)
        queueMicrotask(() => setPulseAt(pos ?? null))
        if (pos) {
          map.flyTo(pos, 13, { duration: 1.0, animate: true })
        } else if (blockVillageBounds?.isValid()) {
          map.flyToBounds(blockVillageBounds, {
            padding: [20, 20],
            maxZoom: 13,
            duration: 0.8,
          })
        } else if (districtFallbackBounds?.isValid()) {
          map.flyToBounds(districtFallbackBounds, {
            padding: [20, 20],
            maxZoom: 12,
            duration: 0.8,
          })
        }
        return
      }

      if (blockKey && selectedDistrict && stateKey && !villageKey) {
        if (blockVillageBounds?.isValid()) {
          queueMicrotask(() => setPulseAt(null))
          map.flyToBounds(blockVillageBounds, {
            padding: [40, 40],
            maxZoom: 12,
            duration: 1.0,
          })
          return
        }
        if (districtFallbackBounds?.isValid()) {
          queueMicrotask(() => setPulseAt(null))
          map.flyToBounds(districtFallbackBounds, {
            padding: [20, 20],
            maxZoom: 11,
            duration: 1.0,
          })
          return
        }
        // Final fallback — geocoded block centroid + pulse.
        const labels = geocodeLabelsFromRecords(records, selection)
        const pos = await geocodeBlockOnce({
          state: labels.state || 'Punjab',
          district: labels.district,
          block: labels.block,
        })
        if (cancelled || mapRef.current !== map) return
        if (pos) {
          queueMicrotask(() => setPulseAt(pos))
          map.flyTo(pos, 11, { animate: true })
        } else queueMicrotask(() => setPulseAt(null))
        return
      }

      queueMicrotask(() => setPulseAt(null))

      if (selectedDistrict) {
        const featBounds = selectedDistrictFeature
          ? L.geoJSON(selectedDistrictFeature).getBounds()
          : null
        if (featBounds?.isValid?.()) {
          map.flyToBounds(featBounds, {
            padding: [30, 30],
            maxZoom: 10,
            duration: 1.0,
          })
          return
        }

        const layer = layerByDistrict.current.get(selectedDistrict)
        const fromLayer =
          layer && typeof layer.getBounds === 'function'
            ? layer.getBounds()
            : null
        const geoB = geo ? getDistrictBoundsFromGeo(geo, selectedDistrict) : null
        const b =
          fromLayer?.isValid?.() ? fromLayer : geoB?.isValid?.() ? geoB : null
        if (b) {
          map.flyToBounds(b, { padding: [40, 40], maxZoom: 10 })
          return
        }
      }

      if (stateKey && STATE_BOUNDS[stateKey]) {
        const sb = STATE_BOUNDS[stateKey]
        map.flyToBounds(L.latLngBounds(sb[0], sb[1]), {
          padding: [30, 30],
          duration: 1.0,
        })
      }
    }

    const id = requestAnimationFrame(() => {
      void run()
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(id)
    }
  }, [
    selection,
    records,
    stateKey,
    selectedDistrict,
    blockKey,
    villageKey,
    geo,
    mapMode,
    mapReadyTick,
    selectedBlockVillageFeatures,
    selectedDistrictFeature,
    selectedVillageFeature,
    blockHighlightShape,
    villageGeoCache,
    villagesLoaded,
  ])

  const activeBoth = !stateKey
  const activePb = stateKey === 'PUNJAB'
  const activeHr = stateKey === 'HARYANA'

  const scopeBtn = (active) =>
    active
      ? 'bg-[#1C3A2A] text-white border-[#1C3A2A]'
      : 'bg-white/95 text-[#1C3A2A] border-[#1C3A2A]/35 shadow-sm hover:bg-[#EDF4EE]'

  const modeBtn = (active) =>
    active
      ? 'bg-[#1C3A2A] text-white border-[#1C3A2A]'
      : 'border-[#1C3A2A]/35 bg-white/95 text-[#1C3A2A] shadow-sm hover:bg-[#EDF4EE]'

  const showMap =
    mapMode === 'clusters' || (mapMode === 'districts' && Boolean(geo))
  const districtFatal = mapMode === 'districts' && loadErr && !geo

  if (districtFatal) {
    return (
      <div className="flex h-full min-h-[200px] w-full flex-col rounded-xl border border-[#1C3A2A]/15 bg-white p-4 text-sm text-[#1C3A2A]">
        <div className="font-['Sora',sans-serif] text-base font-semibold">
          Map data unavailable — use dropdowns to filter
        </div>
        <p className="mt-2 max-w-prose text-[#1C3A2A]/75">{loadErr}</p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      {loadErr && geo ? (
        <p className="shrink-0 text-[11px] text-amber-900/80">{loadErr}</p>
      ) : null}

      <div
        ref={wrapRef}
        className={
          hideToolbar
            ? 'relative min-h-0 flex-1 overflow-hidden bg-white'
            : 'relative min-h-0 flex-1 overflow-hidden rounded-xl border border-[#1C3A2A]/15 bg-white'
        }
      >
        {showMap ? (
          <MapContainer
            ref={mapRef}
            className="z-0 h-full min-h-[200px] w-full"
            center={[30.9, 75.85]}
            zoom={7}
            minZoom={6}
            maxZoom={16}
            maxBounds={PH_MAP_MAX_BOUNDS}
            maxBoundsViscosity={1.0}
            scrollWheelZoom={false}
            zoomControl={false}
            whenReady={() => setMapReadyTick((n) => n + 1)}
          >
            <MapWheelPolicy containerRef={wrapRef} />
            <MapResizer />
            <ClusterDrillLeafletPanes />
            <TileLayer attribution={OSM_ATTR} url={OSM_TILE} />
            <ZoomControl position="bottomleft" />
            {mapMode === 'districts' && geo ? (
              <GeoJSON
                data={geo}
                onEachFeature={onEachFeature}
                style={featureStyle}
              />
            ) : null}
            <ClusterTerritoriesLayer
              clusters={clusters}
              visible={territoriesVisible}
              onClusterClick={onClusterClick}
            />
            <DistrictBoundaryHighlight feature={selectedDistrictFeature} />
            <BlockBoundaryHighlight shape={blockHighlightShape} />
            <VillageBoundaryHighlight feature={selectedVillageFeature} />
            {mapMode === 'districts' &&
            selection?.blockKey &&
            villagesLoaded &&
            blockFarms.length ? (
              <BlockDrillVillageDots
                blockKey={selection.blockKey}
                stateKey={selection.stateKey}
                farms={blockFarms}
                villageFeatures={villageFeatures}
                villageGeoCache={villageGeoCache}
                farmGeoCache={farmGeoCache}
                focusedVillageKey={focusedBlockVillageKey}
                onVillageDotClick={({ villageKey }) => {
                  if (onFocusedBlockVillageChange) {
                    onFocusedBlockVillageChange(villageKey)
                  }
                  if (onFocusedBlockFarmChange) {
                    onFocusedBlockFarmChange(null)
                  }
                }}
              />
            ) : null}
            {mapMode === 'districts' &&
            focusedBlockVillageKey &&
            focusedVillageFarms.length &&
            focusedVillageGeo ? (
              <BlockDrillFarmPins
                farms={focusedVillageFarms}
                centerCoords={focusedVillageGeo.coords}
                villageFeature={focusedVillageGeo.feature}
                farmGeoCache={farmGeoCache}
                focusedFarmId={focusedBlockFarmId}
                onFarmFocus={onFocusedBlockFarmChange}
              />
            ) : null}
            {pulseAt ? <PulseAtPoint position={pulseAt} /> : null}
            {mapMode === 'clusters' ? (
              <ClusterLayer
                clusters={clusters}
                selectedClusterId={selectedClusterId}
                pulseClusterId={drillPending ? selectedClusterId : null}
                onClusterClick={onClusterClick}
                active={mapMode === 'clusters'}
                hideClusterMarkers={Boolean(clusterDrill) || drillPending}
                disableFitBounds={
                  Boolean(clusterDrill) ||
                  drillPending ||
                  !clusterFitBoundsFromMarkers
                }
              />
            ) : null}
            {mapMode === 'clusters' &&
            clusterDrill &&
            clusterDrillBoundary?.kind === 'polygon' ? (
              <Polygon
                key={`hull-${clusterDrill.clusterId}`}
                pane={CLUSTER_HULL_PANE}
                positions={clusterDrillBoundary.ring}
                pathOptions={{
                  color: '#7C3AED',
                  weight: 2,
                  fillColor: '#7C3AED',
                  fillOpacity: 0.08,
                  dashArray: '4 4',
                  opacity: 1,
                }}
                interactive={false}
              />
            ) : null}
            {mapMode === 'clusters' &&
            clusterDrill &&
            clusterDrillBoundary?.kind === 'circle' ? (
              <Circle
                key={`hullcirc-${clusterDrill.clusterId}`}
                pane={CLUSTER_HULL_PANE}
                center={clusterDrillBoundary.center}
                radius={clusterDrillBoundary.radiusMeters}
                pathOptions={{
                  color: '#7C3AED',
                  weight: 2,
                  fillColor: '#7C3AED',
                  fillOpacity: 0.08,
                  dashArray: '4 4',
                  opacity: 1,
                }}
                interactive={false}
              />
            ) : null}
            {mapMode === 'clusters' && clusterDrill ? (
              <VillageDrillLayer
                points={clusterDrill.points}
                active={Boolean(clusterDrill)}
                selectedVillageNorm={drillSelectedVillageNorm}
                onVillageClick={handleVillageDrillDotClick}
              />
            ) : null}
            {mapMode === 'clusters' && clusterDrill && drillFarmPins.length ? (
              <ClusterFarmPinLayer pins={drillFarmPins} />
            ) : null}
          </MapContainer>
        ) : (
          <div className="flex h-full min-h-[200px] items-center justify-center text-sm text-[#1C3A2A]/60">
            Loading map…
          </div>
        )}

        {showMap && blockGeoWarmProgress < 100 ? (
          <div
            className="pointer-events-none absolute bottom-12 left-3 z-[1000] max-w-[220px] rounded border border-[#1C3A2A]/15 bg-white/90 px-2 py-1 text-xs text-gray-600 shadow"
            role="status"
          >
            Warming up location cache… {blockGeoWarmProgress}%
          </div>
        ) : null}

        {hideToolbar ? null : (
          <div className="pointer-events-auto absolute right-3 top-3 z-[1000] flex flex-col items-end gap-1">
            <div className="flex flex-wrap justify-end gap-1">
              <button
                type="button"
                className={`rounded-full border px-3 py-1.5 text-[0.65rem] font-bold uppercase tracking-wide backdrop-blur-sm ${scopeBtn(activePb)}`}
                onClick={() => onStateScopeChange('punjab')}
              >
                Punjab
              </button>
              <button
                type="button"
                className={`rounded-full border px-3 py-1.5 text-[0.65rem] font-bold uppercase tracking-wide backdrop-blur-sm ${scopeBtn(activeHr)}`}
                onClick={() => onStateScopeChange('haryana')}
              >
                Haryana
              </button>
              <button
                type="button"
                className={`rounded-full border px-3 py-1.5 text-[0.65rem] font-bold uppercase tracking-wide backdrop-blur-sm ${scopeBtn(activeBoth)}`}
                onClick={() => onStateScopeChange('both')}
              >
                Both
              </button>
            </div>
            <div className="flex flex-wrap justify-end gap-1">
              <button
                type="button"
                className={`rounded-full border px-3 py-1 text-[0.65rem] font-bold uppercase tracking-wide backdrop-blur-sm ${modeBtn(mapMode === 'districts')}`}
                onClick={() => onMapModeChange?.('districts')}
              >
                Districts
              </button>
              <button
                type="button"
                className={`rounded-full border px-3 py-1 text-[0.65rem] font-bold uppercase tracking-wide backdrop-blur-sm ${modeBtn(mapMode === 'clusters')}`}
                onClick={() => onMapModeChange?.('clusters')}
              >
                Clusters
              </button>
              <button
                type="button"
                aria-pressed={territoriesVisible}
                className={`rounded-full border px-3 py-1 text-[0.65rem] font-bold uppercase tracking-wide backdrop-blur-sm ${modeBtn(territoriesVisible)}`}
                onClick={() => setTerritoriesVisible((v) => !v)}
              >
                Territories
              </button>
            </div>
          </div>
        )}

        {mapMode === 'districts' ? (
          <div className="pointer-events-none absolute bottom-20 left-3 z-[1000] rounded-lg border border-[#1C3A2A]/15 bg-white/95 px-2.5 py-2">
            <p className="text-[0.65rem] font-bold uppercase tracking-wide text-[#1C3A2A]/75">
              Farm density
            </p>
            <ul className="mt-1.5 space-y-1">
              {LEGEND_ROWS.map((row) => (
                <li
                  key={row.t}
                  className="flex items-center gap-2 text-[0.65rem] font-semibold text-[#1C3A2A]"
                >
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-white ring-1 ring-[#1C3A2A]/15"
                    style={{ background: row.c }}
                    aria-hidden
                  />
                  {row.t}
                </li>
              ))}
            </ul>
          </div>
        ) : !clusterDrill && !drillPending ? (
          <div className="pointer-events-none absolute bottom-20 left-3 z-[1000] rounded-lg border border-[#1C3A2A]/15 bg-white/95 px-2.5 py-2">
            <p className="text-[0.65rem] font-bold uppercase tracking-wide text-[#1C3A2A]/75">
              Cluster size
            </p>
            <ul className="mt-1.5 space-y-1">
              {CLUSTER_LEGEND.map((row) => (
                <li
                  key={row.t}
                  className="flex items-center gap-2 text-[0.65rem] font-semibold text-[#1C3A2A]"
                >
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-[#E5E0D8]"
                    style={{ background: row.c }}
                    aria-hidden
                  />
                  {row.t}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {mapMode === 'clusters' && clusterDrill ? (
          <ClusterFarmDetailPanel
            open={farmPanelOpen}
            clusterName={clusterDrill.clusterName}
            farms={clusterDrill.farms}
            clusterRollupFarms={clusterDrill.clusterRollupFarms}
            focusedVillageNorm={drillSelectedVillageNorm}
            onBack={handleBackToClusters}
            onClose={() => setFarmPanelOpen(false)}
            onShowAllOnMap={handleShowAllClusterFarms}
            allOnMap={
              drillFarmPins.length > 0 && drillSelectedVillageNorm == null
            }
          />
        ) : null}
      </div>
    </div>
  )
})

MapPanel.displayName = 'MapPanel'
