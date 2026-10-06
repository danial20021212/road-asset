import { API_BASE } from './inspection'

export const fetchTrips = async () => {
  const res = await fetch(`${API_BASE}/api/trips`)
  if (!res.ok) throw new Error(`Could not load trips (status ${res.status})`)
  const { trips } = await res.json()
  return trips // [{ id, name, positions: [[lat, lng], ...] }]
}

// One saved video: { id, name, positions: [[lat, lng], ...] }, or null if it no longer exists
export const fetchTrip = async (id) => {
  const res = await fetch(`${API_BASE}/api/trips/${id}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Could not load video (status ${res.status})`)
  const { trip } = await res.json()
  return trip
}

export const fetchFrames = async (tripId) => {
  const res = await fetch(`${API_BASE}/api/trips/${tripId}/frames`)
  if (!res.ok) throw new Error(`Could not load frames (status ${res.status})`)
  const { frames } = await res.json()
  return frames // [{ seq, url, lat, lng }]
}

// Replaces all saved boxes of one frame
export const saveFrameBoxes = async (frameId, boxes, edited) => {
  const res = await fetch(`${API_BASE}/api/frames/${frameId}/detections`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      boxes: boxes.map(({ label, box_2d }) => ({ label, box_2d })),
      edited,
    }),
  })
  if (!res.ok) throw new Error(`Could not save boxes (status ${res.status})`)
}

// Every saved video with its counts, newest first
export const fetchVideos = async () => {
  const res = await fetch(`${API_BASE}/api/trips/summary`)
  if (!res.ok) throw new Error(`Could not load videos (status ${res.status})`)
  const { videos } = await res.json()
  return videos // [{ id, name, created_at, gps_count, frame_count, inspected_count, object_count }]
}