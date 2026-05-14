export function getRadius(farms) {
  return Math.max(8, Math.sqrt(Math.max(0, farms)) * 1.8)
}

export function getBubbleColor(farms) {
  if (farms >= 300) return '#E63B2A'
  if (farms >= 100) return '#F07C1E'
  if (farms >= 30) return '#F5C842'
  return '#4CAF50'
}
