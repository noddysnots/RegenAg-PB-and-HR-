/**
 * Load bundled district boundaries from /public/geo (no external fetch / CORS).
 *
 * The bundled files use `Dist_Name` (Title Case) and `State_Name` —
 * older callers expected `DISTRICT` so we add it as an alias.
 * @returns {Promise<{ geojson: import('geojson').FeatureCollection, errors: string[] }>}
 */
export async function loadDistrictGeojson() {
  const errors = []
  try {
    const [rp, rh] = await Promise.all([
      fetch('/geo/Punjab.geojson'),
      fetch('/geo/Haryana.geojson'),
    ])
    if (!rp.ok || !rh.ok) {
      throw new Error(`Local GeoJSON HTTP ${rp.status} / ${rh.status}`)
    }
    const [jPun, jHar] = await Promise.all([rp.json(), rh.json()])

    if (!Array.isArray(jPun?.features) || !Array.isArray(jHar?.features)) {
      throw new Error('GeoJSON files were not valid FeatureCollections')
    }

    const enrich = (f, fallbackState) => {
      const props = f.properties ?? {}
      const distName = props.Dist_Name ?? props.DISTRICT ?? props.NAME_2
      const stateRaw = props.State_Name ?? fallbackState
      return {
        ...f,
        properties: {
          ...props,
          Dist_Name: distName,
          DISTRICT: distName,
          _MAP_STATE_KEY: String(stateRaw ?? '').trim().toUpperCase(),
        },
      }
    }

    const feats = [
      ...(jPun.features ?? []).map((f) => enrich(f, 'PUNJAB')),
      ...(jHar.features ?? []).map((f) => enrich(f, 'HARYANA')),
    ]

    return {
      geojson: { type: 'FeatureCollection', features: feats },
      errors: [],
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load map boundaries'
    errors.push(msg)
    return { geojson: { type: 'FeatureCollection', features: [] }, errors }
  }
}
