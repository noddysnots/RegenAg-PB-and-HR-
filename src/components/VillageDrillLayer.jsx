import { Fragment, useEffect, useMemo } from 'react'
import { CircleMarker, Marker, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import { VILLAGE_DRILL_DOTS_PANE } from '../utils/clusterDrillMapPanes'

/**
 * @typedef {object} VillageDrillPoint
 * @property {number} lat
 * @property {number} lon
 * @property {number} farms
 * @property {number} acres
 * @property {string} village
 * @property {string} [block]
 * @property {string} [district]
 * @property {import('../utils/parseExcel.js').FarmRecord[]} [spreadsheetFarms]
 */

function makeVillageCountIcon(farms, radius) {
  const size = Math.max(20, Math.ceil(radius * 2))
  const fs = Math.min(11, Math.max(8, Math.floor(5 + radius / 4)))
  return L.divIcon({
    className: 'village-drill-count',
    html: `<div style="pointer-events:none;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;font-size:${fs}px;font-weight:700;color:#fff;font-family:ui-sans-serif,system-ui,sans-serif;text-shadow:0 1px 2px rgba(0,0,0,.45)">${Math.round(farms)}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

/**
 * @param {object} props
 * @param {VillageDrillPoint[]} props.points
 * @param {boolean} props.active
 * @param {string | null} [props.selectedVillageNorm] lowercase trimmed village name for selection ring
 * @param {(point: VillageDrillPoint) => void} [props.onVillageClick]
 */
export function VillageDrillLayer({
  points,
  active,
  selectedVillageNorm = null,
  onVillageClick,
}) {
  const valid = useMemo(
    () =>
      (points ?? []).filter(
        (p) =>
          p.lat != null &&
          p.lon != null &&
          Number.isFinite(p.lat) &&
          Number.isFinite(p.lon),
      ),
    [points],
  )

  useEffect(() => {
    if (!active) return
    if (import.meta.env?.DEV) {
      console.log('[4] dots rendered:', valid.length)
    }
  }, [active, valid])

  if (!active || !valid.length) return null

  return (
    <>
      {valid.map((p, idx) => {
        const spreadsheetCount = Array.isArray(p.spreadsheetFarms)
          ? p.spreadsheetFarms.length
          : 0
        const hasJoinedRows = spreadsheetCount > 0
        const displayCount = hasJoinedRows
          ? spreadsheetCount
          : Math.round(p.farms ?? 0)
        const radius = Math.max(
          10,
          Math.sqrt(Math.max(1, displayCount)) * 2.2,
        )
        const color = displayCount >= 10 ? '#F59E0B' : '#22C55E'
        const showLabel = radius > 12
        const icon = makeVillageCountIcon(displayCount, radius)
        const key = `${p.village}|${p.block}|${p.district}|${idx}`
        const vNorm = String(p.village ?? '').trim().toLowerCase()
        const selected =
          Boolean(selectedVillageNorm) && vNorm === selectedVillageNorm
        return (
          <Fragment key={key}>
            {showLabel ? (
              <Marker
                position={[p.lat, p.lon]}
                icon={icon}
                interactive={false}
                zIndexOffset={400}
                pane={VILLAGE_DRILL_DOTS_PANE}
              />
            ) : null}
            <CircleMarker
              center={[p.lat, p.lon]}
              radius={radius}
              zIndexOffset={900}
              pane={VILLAGE_DRILL_DOTS_PANE}
              pathOptions={{
                fillColor: color,
                fillOpacity: hasJoinedRows ? 0.88 : 0.45,
                color: selected ? '#1C3A2A' : '#fff',
                weight: selected ? 3 : 2,
                opacity: hasJoinedRows ? 1 : 0.85,
                dashArray: hasJoinedRows ? undefined : '3 3',
                bubblingMouseEvents: false,
              }}
              eventHandlers={{
                click: (e) => {
                  L.DomEvent.stopPropagation(e)
                  onVillageClick?.(p)
                },
              }}
            >
              <Tooltip
                direction="top"
                opacity={1}
                offset={[0, -Math.ceil(radius)]}
              >
                <div className="max-w-[220px] rounded-lg bg-[#1C3A2A] px-2.5 py-2 text-left text-[11px] font-medium leading-snug text-white">
                  <p className="mb-1 text-sm font-semibold">{p.village}</p>
                  <p>
                    Farms: <b>{displayCount.toLocaleString('en-IN')}</b>
                    {hasJoinedRows ? null : (
                      <span className="ml-1 opacity-75">(estimated)</span>
                    )}
                  </p>
                  <p>
                    Acres:{' '}
                    <b>
                      {Number(p.acres ?? 0).toLocaleString('en-IN', {
                        maximumFractionDigits: 1,
                      })}
                    </b>
                  </p>
                  {hasJoinedRows ? (
                    <p className="mt-1 opacity-80">Click to see farm IDs</p>
                  ) : (
                    <p className="mt-1 opacity-75">No spreadsheet rows joined</p>
                  )}
                </div>
              </Tooltip>
            </CircleMarker>
          </Fragment>
        )
      })}
    </>
  )
}
