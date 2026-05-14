import { Fragment, useMemo } from 'react'
import { CircleMarker, Marker, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import { findVillageCentroidSync } from '../utils/villageCentroid'
import { resolveBlockToSubdist } from '../utils/blockNameAlias'
import { VILLAGE_DRILL_DOTS_PANE } from '../utils/clusterDrillMapPanes'

/**
 * @param {number} farms farm count for this village
 * @param {number} radius pixel radius of the underlying CircleMarker
 */
function makeCountIcon(farms, radius) {
  const size = Math.max(20, Math.ceil(radius * 2))
  const fs = Math.min(11, Math.max(8, Math.floor(5 + radius / 4)))
  return L.divIcon({
    className: 'block-drill-village-count',
    html: `<div style="pointer-events:none;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;font-size:${fs}px;font-weight:700;color:#fff;font-family:ui-sans-serif,system-ui,sans-serif;text-shadow:0 1px 2px rgba(0,0,0,.45)">${Math.round(farms)}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

/**
 * Level-1 of the block drill: one circle marker per unique village in
 * the selected block, sized by farm count and colour-coded for
 * load (≥10 farms turns amber). Clicking a dot bubbles up the
 * village key + centroid via `onVillageDotClick` so the parent can
 * zoom and render farm pins.
 *
 * @param {object} props
 * @param {string} props.blockKey            uppercase selection.blockKey
 * @param {string} [props.stateKey]          'PUNJAB' | 'HARYANA' | ''
 * @param {Array<import('../utils/parseExcel.js').FarmRecord>} props.farms
 *   already filtered to the selected block (one record per farm)
 * @param {Array<import('geojson').Feature>} [props.villageFeatures]
 * @param {Record<string, [number, number]>} [props.villageGeoCache]
 * @param {string | null} [props.focusedVillageKey]
 *   uppercase _villageKey for the currently-active village so we can
 *   highlight its dot ring
 * @param {(args: {
 *   villageKey: string,
 *   villageName: string,
 *   coords: [number, number],
 *   feature: import('geojson').Feature | null,
 *   farms: Array<import('../utils/parseExcel.js').FarmRecord>,
 * }) => void} props.onVillageDotClick
 */
export function BlockDrillVillageDots({
  blockKey,
  stateKey = '',
  farms,
  villageFeatures = [],
  villageGeoCache = {},
  focusedVillageKey = null,
  onVillageDotClick,
}) {
  const dots = useMemo(() => {
    if (!blockKey || !farms?.length) return []

    /** @type {Map<string, { villageKey: string, villageName: string, farms: Array<import('../utils/parseExcel.js').FarmRecord> }>} */
    const groups = new Map()
    for (const f of farms) {
      const vk = f._villageKey
      if (!vk) continue
      let entry = groups.get(vk)
      if (!entry) {
        entry = { villageKey: vk, villageName: f.village, farms: [] }
        groups.set(vk, entry)
      }
      entry.farms.push(f)
    }

    const subdist = resolveBlockToSubdist(blockKey) || ''
    const stU = String(stateKey || '').toUpperCase()
    const stateAbbr =
      stU === 'HARYANA' ? 'HR' : stU === 'PUNJAB' ? 'PB' : ''

    /** @type {Array<{
     *   villageKey: string,
     *   villageName: string,
     *   coords: [number, number],
     *   feature: import('geojson').Feature | null,
     *   farms: Array<import('../utils/parseExcel.js').FarmRecord>,
     * }>} */
    const out = []
    for (const entry of groups.values()) {
      const hit = findVillageCentroidSync({
        villageName: entry.villageName,
        blockName: blockKey,
        villageFeatures,
        villageGeoCache,
        subdist,
        stateAbbr,
      })
      if (!hit) continue
      out.push({ ...entry, coords: hit.coords, feature: hit.feature })
    }
    return out
  }, [blockKey, stateKey, farms, villageFeatures, villageGeoCache])

  if (!dots.length) return null

  return (
    <>
      {dots.map((d) => {
        const count = d.farms.length
        const radius = Math.max(10, Math.sqrt(Math.max(1, count)) * 2.6)
        const color = count >= 10 ? '#F59E0B' : '#22C55E'
        const showLabel = radius > 12
        const icon = makeCountIcon(count, radius)
        const selected = focusedVillageKey === d.villageKey
        return (
          <Fragment key={d.villageKey}>
            {showLabel ? (
              <Marker
                position={d.coords}
                icon={icon}
                interactive={false}
                zIndexOffset={400}
                pane={VILLAGE_DRILL_DOTS_PANE}
              />
            ) : null}
            <CircleMarker
              center={d.coords}
              radius={radius}
              pane={VILLAGE_DRILL_DOTS_PANE}
              pathOptions={{
                fillColor: color,
                fillOpacity: 0.88,
                color: selected ? '#1C3A2A' : '#fff',
                weight: selected ? 3 : 2,
                opacity: 1,
                bubblingMouseEvents: false,
              }}
              eventHandlers={{
                click: (e) => {
                  L.DomEvent.stopPropagation(e)
                  onVillageDotClick?.({
                    villageKey: d.villageKey,
                    villageName: d.villageName,
                    coords: d.coords,
                    feature: d.feature,
                    farms: d.farms,
                  })
                },
              }}
            >
              <Tooltip
                direction="top"
                opacity={1}
                offset={[0, -Math.ceil(radius)]}
              >
                <div className="max-w-[220px] rounded-lg bg-[#1C3A2A] px-2.5 py-2 text-left text-[11px] font-medium leading-snug text-white">
                  <p className="mb-1 text-sm font-semibold">{d.villageName}</p>
                  <p>
                    Farms: <b>{count.toLocaleString('en-IN')}</b>
                  </p>
                </div>
              </Tooltip>
            </CircleMarker>
          </Fragment>
        )
      })}
    </>
  )
}
