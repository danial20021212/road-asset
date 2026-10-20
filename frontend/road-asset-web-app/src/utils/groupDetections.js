// Merges per-frame detections into "objects" (the same real-world thing seen in several frames).
// Frames are 1 second apart, so a frame-index gap of N means N seconds.
//
// Two sightings are the same object when ALL of these hold:
//   1. same class
//   2. they are 1..maxGap frames apart (a gap > 1 tolerates a missed detection)
//   3. their horizontal centres are close (X_TOLERANCE per frame of gap, 0-1000 scale)
// Two boxes in the same frame are never merged, because they must be two different objects.

export const X_TOLERANCE = 200

const centerX = (b) => (b.box_2d[1] + b.box_2d[3]) / 2
const area = (b) => (b.box_2d[2] - b.box_2d[0]) * (b.box_2d[3] - b.box_2d[1])

// frames: the array from useTripFrames (in order, one per second)
// returns { [label]: [ { id, label, number, sightings, bestIdx, first, last } ] }
export function groupDetections(frames, maxGap = 2) {
  // 1) collect every box as a "sighting", in frame order, bucketed by class
  const byLabel = {}
  frames.forEach((frame, frameIdx) => {
    frame.boxes.forEach((box) => {
      ;(byLabel[box.label] ||= []).push({ frameIdx, frame, box, cx: centerX(box), area: area(box) })
    })
  })

  // 2) per class, chain sightings into tracks
  const result = {}
  for (const [label, sightings] of Object.entries(byLabel)) {
    const tracks = []
    let active = []
    for (const s of sightings) {
      active = active.filter((t) => s.frameIdx - t.last.frameIdx <= maxGap)

      let best = null
      let bestDist = Infinity
      for (const t of active) {
        const gap = s.frameIdx - t.last.frameIdx
        if (gap < 1) continue // already has a sighting in this frame
        const dist = Math.abs(s.cx - t.last.cx)
        if (dist <= X_TOLERANCE * gap && dist < bestDist) {
          best = t
          bestDist = dist
        }
      }

      if (best) {
        best.sightings.push(s)
        best.last = s
      } else {
        const t = { sightings: [s], last: s }
        tracks.push(t)
        active.push(t)
      }
    }

    result[label] = tracks.map((t, i) => {
      let bestIdx = 0
      t.sightings.forEach((s, k) => {
        if (s.area > t.sightings[bestIdx].area) bestIdx = k // biggest box = clearest view
      })
      return {
        id: t.sightings[0].box.id,
        label,
        number: i + 1,
        sightings: t.sightings,
        bestIdx,
        first: t.sightings[0].frame,
        last: t.sightings[t.sightings.length - 1].frame,
      }
    })
  }
  return result
}
