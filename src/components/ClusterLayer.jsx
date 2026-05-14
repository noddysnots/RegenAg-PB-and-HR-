import { Fragment, useEffect, useMemo, useState } from 'react'
import { CircleMarker, Marker, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import { getBubbleColor, getRadius } from '../utils/clusterMapStyle'

/**
 * @typedef {object} ClusterVillage
 * @property {string} district
 * @property {string} block
 * @property {string} village
 * @property {number} farms
 * @property {number} acres
 */

/**
 * @typedef {object} Cluster
 * @property {string} cluster_id
 * @property {string} cluster_name
 * @property {string} state
 * @property {number} farms
 * @property {number} acres
 * @property {ClusterVillage[]} villages
 * @property {string} [districtKey]
 * @property {number} [lat]
 * @property {number} [lon]
 */

function makeLabelIcon(farms, radius) {
  const size = Math.max(22, Math.ceil(radius * 2))
  const fs = Math.min(14, Math.max(9, Math.floor(6 + radius / 5)))
  return L.divIcon({
    className: 'cluster-bubble-count',
    html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;font-size:${fs}px;font-weight:700;color:#fff;font-family:ui-sans-serif,system-ui,sans-serif;pointer-events:none;text-shadow:0 1px 2px rgba(0,0,0,.4)">${farms}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function FitClusterBounds({ clusterBoundsKey, active }) {
  const map = useMap()
  useEffect(() => {
    if (!active || !clusterBoundsKey) return
    const parts = clusterBoundsKey.split(';').filter(Boolean)
    const pts = parts.map((p) => {
      const [la, lo] = p.split(',').map(Number)
      return [la, lo]
    })
    if (!pts.length) return
    const b = L.latLngBounds(pts)
    if (b.isValid()) map.fitBounds(b, { padding: [48, 48], maxZoom: 10 })
  }, [map, active, clusterBoundsKey])
  return null
}

/**
 * @param {object} props
 * @param {Cluster[]} props.clusters
 * @param {string | null} props.selectedClusterId
 * @param {string | null} [props.pulseClusterId] bubble to pulse while geocoding / flying
 * @param {(clusterId: string) => void} props.onClusterClick
 * @param {boolean} props.active
 * @param {boolean} [props.hideClusterMarkers] when true, hide bubbles (village drill mode)
 * @param {boolean} [props.disableFitBounds] skip auto fit-bounds on visible clusters
 */
export function ClusterLayer({
  clusters,
  selectedClusterId,
  pulseClusterId = null,
  onClusterClick,
  active,
  hideClusterMarkers = false,
  disableFitBounds = false,
}) {
  const [pulseOn, setPulseOn] = useState(false)
  useEffect(() => {
    if (!pulseClusterId) {
      setPulseOn(false)
      return
    }
    const id = window.setInterval(() => setPulseOn((p) => !p), 420)
    return () => window.clearInterval(id)
  }, [pulseClusterId])
  const valid = useMemo(
    () =>
      clusters.filter(
        (c) =>
          c.lat != null &&
          c.lon != null &&
          Number.isFinite(c.lat) &&
          Number.isFinite(c.lon),
      ),
    [clusters],
  )

  const clusterBoundsKey = useMemo(
    () => valid.map((c) => `${c.lat},${c.lon}`).join(';'),
    [valid],
  )

  if (!active) return null

  return (
    <>
      <FitClusterBounds
        clusterBoundsKey={clusterBoundsKey}
        active={active && !disableFitBounds}
      />
      {hideClusterMarkers
        ? null
        : valid.map((c) => {
            const r = getRadius(c.farms)
            const color = getBubbleColor(c.farms)
            const sel = selectedClusterId === c.cluster_id
            const loading = pulseClusterId === c.cluster_id
            const showCountInBubble = r > 14
            const icon = makeLabelIcon(c.farms, r)
            return (
              <Fragment key={c.cluster_id}>
                <CircleMarker
                  center={[c.lat, c.lon]}
                  radius={r}
                  pathOptions={{
                    fillColor: color,
                    fillOpacity: loading ? (pulseOn ? 0.72 : 0.88) : 0.85,
                    color: loading ? '#F59E0B' : '#FFFFFF',
                    weight: loading ? (pulseOn ? 4 : 2.5) : sel ? 3 : 1.5,
                    opacity: 1,
                  }}
                  eventHandlers={{
                    click: () => onClusterClick(c.cluster_id),
                  }}
                >
                  <Tooltip direction="top" opacity={1} sticky offset={[0, -6]}>
                    <div className="min-w-[160px] rounded-lg bg-[#1C3A2A] px-2.5 py-2 text-left text-[11px] font-medium leading-snug text-white">
                      <p className="mb-1 text-sm font-semibold">{c.cluster_name}</p>
                      <p>
                        Farms: <b>{c.farms.toLocaleString('en-IN')}</b>
                      </p>
                      <p>
                        Acres:{' '}
                        <b>
                          {c.acres.toLocaleString('en-IN', {
                            maximumFractionDigits: 0,
                          })}
                        </b>
                      </p>
                      <p>
                        Villages: <b>{c.villages.length}</b>
                      </p>
                    </div>
                  </Tooltip>
                </CircleMarker>
                {showCountInBubble ? (
                  <Marker
                    position={[c.lat, c.lon]}
                    icon={icon}
                    interactive={false}
                    zIndexOffset={700}
                  />
                ) : null}
              </Fragment>
            )
          })}
    </>
  )
}
