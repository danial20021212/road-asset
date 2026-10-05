const M_PER_DEG = 111320
const MAX_DISTANCE_M = 15
const MIN_HITS = 3

// Distance in metres from point p to segment a-b (all [lat, lng])
function distToSegmentM(p, a, b) {
  const cos = Math.cos((p[0] * Math.PI) / 180)
  const toXY = ([lat, lng]) => [lng * cos * M_PER_DEG, lat * M_PER_DEG]
  const [px, py] = toXY(p)
  const [ax, ay] = toXY(a)
  const [bx, by] = toXY(b)

  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

export function isRoadCovered(road, tripPoints) {
  const line = road.positions
  let hits = 0
  for (const p of tripPoints) {
    for (let i = 1; i < line.length; i++) {
      if (distToSegmentM(p, line[i - 1], line[i]) <= MAX_DISTANCE_M) {
        if (++hits >= MIN_HITS) return true
        break
      }
    }
  }
  return false
}