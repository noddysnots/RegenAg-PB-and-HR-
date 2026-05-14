import { useEffect, useMemo, useRef } from 'react'
import { CircleMarker, Popup, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import { FARM_DRILL_PINS_PANE } from '../utils/clusterDrillMapPanes'

/**
 * @param {string} status
 */
function authChipStyle(status) {
  const u = String(status ?? '').toUpperCase()
  if (u === 'ACCEPTED')
    return { bg: '#dcfce7', fg: '#166534', label: status || 'Accepted' }
  if (u === 'REJECTED')
    return { bg: '#fee2e2', fg: '#991b1b', label: status || 'Rejected' }
  if (u === 'PENDING')
    return { bg: '#fef3c7', fg: '#92400e', label: status || 'Pending' }
  return { bg: '#1C3A2A1A', fg: '#1C3A2A', label: status || '—' }
}

/**
 * Lay farms out around a village centroid. The first farm sits dead
 * centre (so single-farm villages get one neat pin) and every
 * subsequent farm is dropped onto a widening spiral so overlap is
 * minimised.
 * @param {Array<import('../utils/parseExcel.js').FarmRecord>} farms
 * @param {[number, number]} center
 * @returns {Array<{ farm: import('../utils/parseExcel.js').FarmRecord, position: [number, number] }>}
 */
function spiralLayout(farms, center) {
  const total = farms.length
  if (!total) return []
  const out = []
  for (let i = 0; i < total; i += 1) {
    const angle = (i / Math.max(total, 1)) * 2 * Math.PI
    const r = i === 0 ? 0 : 0.0004 * Math.ceil(i / 6)
    const lat = center[0] + r * Math.sin(angle)
    const lon = center[1] + r * Math.cos(angle)
    out.push({ farm: farms[i], position: [lat, lon] })
  }
  return out
}

/**
 * Level-2 + Level-3 of the block drill:
 *   - flyToBounds the village polygon (or the village centroid when
 *     no polygon is available) so farms come into view.
 *   - Drop one yellow circle marker per farm.
 *   - Each marker carries a popup showing Farm ID, farmer, area,
 *     surveyor and the two auth-chip statuses.
 *
 * Selecting a different village (or clearing the focus) tears down
 * the layer automatically via React-Leaflet's component lifecycle.
 *
 * @param {object} props
 * @param {Array<import('../utils/parseExcel.js').FarmRecord>} props.farms
 * @param {[number, number]} props.centerCoords
 * @param {import('geojson').Feature | null} [props.villageFeature]
 * @param {string | null} [props.focusedFarmId]
 * @param {(farmId: string | null) => void} [props.onFarmFocus]
 */
export function BlockDrillFarmPins({
  farms,
  centerCoords,
  villageFeature = null,
  focusedFarmId = null,
  onFarmFocus,
}) {
  const map = useMap()
  const flyKeyRef = useRef(/** @type {string | null} */ (null))

  const pins = useMemo(
    () => spiralLayout(farms ?? [], centerCoords),
    [farms, centerCoords],
  )

  // Fly to the village whenever the underlying selection changes.
  // We key on `villageFeature || centerCoords.join` so re-renders with
  // the same village don't re-fly mid-interaction.
  const flyKey = useMemo(() => {
    if (villageFeature) {
      try {
        return `feat:${JSON.stringify(villageFeature.properties ?? {})}`
      } catch {
        return `feat:${Math.random()}`
      }
    }
    return `pt:${centerCoords?.[0]?.toFixed?.(5)},${centerCoords?.[1]?.toFixed?.(5)}`
  }, [villageFeature, centerCoords])

  useEffect(() => {
    if (!map || !centerCoords) return
    if (flyKeyRef.current === flyKey) return
    flyKeyRef.current = flyKey

    if (villageFeature) {
      try {
        const bounds = L.geoJSON(villageFeature).getBounds()
        if (bounds.isValid()) {
          map.flyToBounds(bounds, {
            padding: [40, 40],
            duration: 1.0,
            maxZoom: 14,
          })
          return
        }
      } catch {
        /* fall through */
      }
    }
    map.flyTo(centerCoords, 14, { duration: 1.0, animate: true })
  }, [map, flyKey, villageFeature, centerCoords])

  // eslint-disable-next-line no-console
  useEffect(() => {
    console.log('farm pins placed:', pins.length)
  }, [pins.length])

  if (!pins.length) return null

  return (
    <>
      {pins.map(({ farm, position }, i) => {
        const isFocused = focusedFarmId && farm.farmId === focusedFarmId
        const farmer = authChipStyle(farm.farmerAuth)
        const farmAuth = authChipStyle(farm.farmAuth)
        return (
          <CircleMarker
            key={`${farm.farmId}-${i}`}
            center={position}
            radius={9}
            pane={FARM_DRILL_PINS_PANE}
            pathOptions={{
              fillColor: '#F59E0B',
              fillOpacity: 0.95,
              color: isFocused ? '#1C3A2A' : '#fff',
              weight: isFocused ? 3 : 2,
              opacity: 1,
              bubblingMouseEvents: false,
            }}
            eventHandlers={{
              click: (e) => {
                L.DomEvent.stopPropagation(e)
                onFarmFocus?.(farm.farmId)
              },
              popupclose: () => {
                if (focusedFarmId === farm.farmId) onFarmFocus?.(null)
              },
            }}
          >
            <Tooltip direction="top" opacity={1}>
              Farm ID: {farm.farmId || '—'}
            </Tooltip>
            <Popup
              maxWidth={260}
              eventHandlers={{
                add: () => onFarmFocus?.(farm.farmId),
              }}
            >
              <div className="min-w-[200px] font-['IBM_Plex_Sans',sans-serif] text-[12px] leading-[1.6] text-[#1C3A2A]">
                <div className="mb-1.5 text-[13px] font-bold">
                  Farm ID: {farm.farmId || '—'}
                </div>
                <div>
                  <span className="text-gray-500">Farmer:</span>{' '}
                  {farm.farmerName || '—'}
                </div>
                <div>
                  <span className="text-gray-500">Village:</span>{' '}
                  {farm.village || '—'}
                </div>
                <div>
                  <span className="text-gray-500">Block:</span>{' '}
                  {farm.block || '—'}
                </div>
                <div>
                  <span className="text-gray-500">Area:</span>{' '}
                  {Number(farm.areaAcres ?? 0).toLocaleString('en-IN', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  })}{' '}
                  acres
                </div>
                <div>
                  <span className="text-gray-500">Surveyor:</span>{' '}
                  {farm.surveyor || '—'}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <span
                    style={{
                      background: farmer.bg,
                      color: farmer.fg,
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 10,
                      fontWeight: 600,
                    }}
                  >
                    Farmer: {farmer.label}
                  </span>
                  <span
                    style={{
                      background: farmAuth.bg,
                      color: farmAuth.fg,
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 10,
                      fontWeight: 600,
                    }}
                  >
                    Farm: {farmAuth.label}
                  </span>
                </div>
              </div>
            </Popup>
          </CircleMarker>
        )
      })}
    </>
  )
}
