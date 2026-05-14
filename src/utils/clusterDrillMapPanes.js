/**
 * Cluster-territory fill pane — sits below the default `overlayPane`
 * (zIndex 400) so cluster bubbles, district outlines and the cluster
 * drill hull all render on top of the territory shading.
 */
export const CLUSTER_TERRITORY_PANE = 'clusterTerritory'

/** Leaflet pane for cluster hull (below village dots; pane ignores pointer events). */
export const CLUSTER_HULL_PANE = 'clusterHullOutline'

/** Leaflet pane for drill village CircleMarkers (above hull). */
export const VILLAGE_DRILL_DOTS_PANE = 'villageDrillDots'

/** Farm pins above village dots. */
export const FARM_DRILL_PINS_PANE = 'farmDrillPins'
