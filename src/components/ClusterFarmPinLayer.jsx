import { CircleMarker, Popup, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import { FARM_DRILL_PINS_PANE } from '../utils/clusterDrillMapPanes'

function farmAuthChipClass(status) {
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
 * @param {object} props
 * @param {Array<{ farm: import('../utils/parseExcel.js').FarmRecord, position: [number, number] }>} props.pins
 */
export function ClusterFarmPinLayer({ pins }) {
  if (!pins?.length) return null

  return (
    <>
      {pins.map(({ farm, position }, i) => (
        <CircleMarker
          key={`${farm.farmId}-${i}`}
          center={position}
          radius={8}
          pane={FARM_DRILL_PINS_PANE}
          pathOptions={{
            fillColor: '#F59E0B',
            fillOpacity: 0.95,
            color: '#fff',
            weight: 1.5,
            opacity: 1,
            bubblingMouseEvents: false,
          }}
          eventHandlers={{
            click: (e) => {
              L.DomEvent.stopPropagation(e)
            },
          }}
        >
          <Tooltip direction="top" opacity={1}>
            Farm ID: {farm.farmId}
          </Tooltip>
          <Popup>
            <div className="min-w-[160px] font-sans text-xs text-[#1C3A2A]">
              <div className="mb-1 font-bold">Farm ID: {farm.farmId}</div>
              <div>{farm.farmerName}</div>
              <div className="mt-0.5 text-[#1C3A2A]/70">
                {farm.village}, {farm.block}
              </div>
              <div className="text-[#1C3A2A]/70">
                {Number(farm.areaAcres ?? 0).toLocaleString('en-IN', {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2,
                })}{' '}
                acres
              </div>
              <div className="mt-1">
                <span className={farmAuthChipClass(farm.farmAuth)}>
                  Farm: {farm.farmAuth || '—'}
                </span>
              </div>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </>
  )
}
